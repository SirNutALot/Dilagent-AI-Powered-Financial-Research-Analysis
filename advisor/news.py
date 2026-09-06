from __future__ import annotations

import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import quote_plus
from xml.etree import ElementTree

import httpx

from advisor.config import NEWS_CACHE_TTL, NEWS_TIMEOUT, USER_AGENT
from advisor.scoring import clamp

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}

SEVERE = (
    "bankruptcy", "defaults on", "insolvency", "criminal charge", "bribery",
    "embezzle", "accounting scandal", "ponzi", "going concern",
    "delisted", "collapse",
)
ELEVATED = (
    "lawsuit", "investigation", "probe", "sec charge", "sec charges",
    "scandal", "downgrade", "layoff", "layoffs", "recall", "class action",
    "antitrust", "sanction", "fine", "penalty", "short seller",
    "profit warning", "misses estimates", "missed estimates", "guidance cut",
    "whistleblower", "fraud", "restatement",
)
NEGATED = (
    "defeats", "defeat", "beats", "beat", "wins", "won", "dismissed",
    "acquitted", "rejects", "rejected", "cleared", "prevails", "prevailed",
)
HARMLESS = (
    "fraud management", "anti-fraud", "antifraud", "fraud detection",
    "financial fraud management", "fraud prevention", "disrupts",
    "disrupted", "combats fraud", "against fraud",
)
SPAM = (
    "lead plaintiff", "reminds investors", "reminds shareholders",
    "levi & korsinsky", "the gross law firm", "kahn swick",
    "suewallst", "shareholders who lost", "opportunity to lead",
    "class action deadline", "lost money on", "contact levi",
    "rosen law firm", "glancy prongay", "investor rights law",
)
WATCH = (
    "delay", "delayed", "warning", "activist", "outflow", "resignation",
    "ceo leaves", "cfo leaves", "downturn", "weak demand", "cuts forecast",
)
POSITIVE = (
    "beats estimates", "beat estimates", "record profit", "record revenue",
    "upgrade", "raised guidance", "raises guidance", "buyback", "dividend hike",
    "expansion", "approval", "contract win", "strong demand", "outperform",
    "raised to", "initiated buy",
)

SOURCE_FEEDS = (
    ("Financial Times", "https://www.ft.com/rss/home"),
    ("Reuters Business", "https://feeds.reuters.com/reuters/businessNews"),
    ("CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114"),
    ("MarketWatch", "https://feeds.marketwatch.com/marketwatch/topstories/"),
    ("BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml"),
    ("Yahoo Finance", "https://finance.yahoo.com/news/rssindex"),
)


def _pub_ts(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return parsedate_to_datetime(value).timestamp()
    except Exception:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except Exception:
            return 0.0


def _parse_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        try:
            return value[:10]
        except Exception:
            return None


def _flags(text: str) -> tuple[list[str], str]:
    blob = text.lower()
    if any(phrase in blob for phrase in HARMLESS):
        blob = _strip_phrases(blob, HARMLESS)
    found: list[str] = []
    level = "none"
    negated = any(word in blob for word in NEGATED)
    for word in SEVERE:
        if word in blob:
            found.append(word)
            level = "watch" if negated else "severe"
    if level in {"none", "watch"}:
        for word in ELEVATED:
            if word in blob:
                found.append(word)
                if level != "severe":
                    level = "watch" if negated else "elevated"
    if level == "none":
        for word in WATCH:
            if word in blob:
                found.append(word)
                level = "watch"
    return found[:4], level


def _strip_phrases(blob: str, phrases: tuple[str, ...]) -> str:
    cleaned = blob
    for phrase in phrases:
        cleaned = cleaned.replace(phrase, " ")
    return cleaned


def _sentiment(text: str) -> float:
    blob = text.lower()
    score = 0.0
    for word in POSITIVE:
        if word in blob:
            score += 1.2
    for word in WATCH:
        if word in blob:
            score -= 0.6
    for word in ELEVATED:
        if word in blob:
            score -= 1.4
    for word in SEVERE:
        if word in blob:
            score -= 2.4
    return max(-3.0, min(3.0, score))


def _relevant(text: str, ticker: str, name: str) -> bool:
    blob = text.lower()
    token = ticker.split(".")[0].lower()
    if len(token) >= 2 and re.search(rf"\b{re.escape(token)}\b", blob):
        return True
    pieces = [p for p in re.split(r"[^a-z0-9]+", name.lower()) if len(p) > 2]
    hits = sum(1 for p in pieces[:4] if p in blob)
    return hits >= 1


def _dedupe(articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in articles:
        key = re.sub(r"[^a-z0-9]+", "", (item.get("title") or "").lower())[:80]
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def _google_news(query: str) -> list[dict[str, Any]]:
    url = (
        "https://news.google.com/rss/search?"
        f"q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en"
    )
    return _rss(url, source="Google News")


def _looks_image(url: str) -> bool:
    raw = (url or "").split("?")[0].lower()
    return raw.startswith("http") and (
        any(raw.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"))
        or "image" in raw
        or "img" in raw
        or "photo" in raw
        or "media" in raw
    )


def _item_image(item: ElementTree.Element) -> str | None:
    for enc in item.findall("enclosure"):
        url = enc.get("url") or ""
        typ = (enc.get("type") or "").lower()
        if url and (typ.startswith("image") or _looks_image(url)):
            return url
    for el in item.iter():
        tag = el.tag.split("}")[-1].lower()
        if tag in {"content", "thumbnail", "image"}:
            url = el.get("url") or el.get("href") or (el.text or "").strip()
            if not url:
                child = el.find("url")
                url = (child.text or "").strip() if child is not None else ""
            if url.startswith("http") and (tag != "content" or _looks_image(url) or el.get("medium") == "image" or (el.get("type") or "").startswith("image")):
                return url
    blob = ""
    for el in item.iter():
        tag = el.tag.split("}")[-1].lower()
        if tag in {"description", "encoded", "content"} and el.text:
            blob += el.text
    match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', blob, re.I)
    if match and match.group(1).startswith("http"):
        return match.group(1)
    return None


def _rss(url: str, source: str, max_items: int = 30) -> list[dict[str, Any]]:
    try:
        with httpx.Client(timeout=NEWS_TIMEOUT, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
    except Exception:
        return []

    try:
        root = ElementTree.fromstring(response.content)
    except ElementTree.ParseError:
        return []

    def _child(node: ElementTree.Element, *names: str) -> ElementTree.Element | None:
        wanted = {name.lower() for name in names}
        for el in node:
            if el.tag.split("}")[-1].lower() in wanted:
                return el
        return None

    def _text(node: ElementTree.Element | None) -> str:
        if node is None:
            return ""
        return (node.text or "").strip()

    items: list[dict[str, Any]] = []
    nodes = [el for el in root.iter() if el.tag.split("}")[-1].lower() in {"item", "entry"}]
    for item in nodes[:max_items]:
        title = _text(_child(item, "title"))
        link_el = _child(item, "link")
        link = (link_el.get("href") if link_el is not None else "") or _text(link_el)
        summary = re.sub("<[^<]+?>", "", _text(_child(item, "description", "summary", "content")))
        pub_el = _child(item, "pubDate", "updated", "published", "date")
        pub = _text(pub_el)
        if not title:
            continue
        items.append({
            "title": title,
            "url": (link or "").strip(),
            "summary": summary[:320],
            "source": source,
            "published": _parse_date(pub),
            "image": _item_image(item),
            "_ts": _pub_ts(pub),
        })
    return items


def _yahoo_news(handle: Any) -> list[dict[str, Any]]:
    try:
        raw = handle.news or []
    except Exception:
        return []
    articles: list[dict[str, Any]] = []
    for item in raw:
        content = item.get("content") if isinstance(item, dict) else None
        if content:
            title = content.get("title") or ""
            summary = content.get("summary") or content.get("description") or ""
            url = ""
            canonical = content.get("canonicalUrl") or {}
            click = content.get("clickThroughUrl") or {}
            if isinstance(canonical, dict):
                url = canonical.get("url") or ""
            if not url and isinstance(click, dict):
                url = click.get("url") or ""
            provider = (content.get("provider") or {}).get("displayName") or "Yahoo Finance"
            published = None
            pub = content.get("pubDate") or content.get("displayTime")
            if isinstance(pub, str):
                published = pub[:10]
        else:
            title = item.get("title") or ""
            summary = item.get("summary") or ""
            url = item.get("link") or ""
            provider = item.get("publisher") or "Yahoo Finance"
            ts = item.get("providerPublishTime")
            published = None
            if ts:
                try:
                    published = datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%d")
                except Exception:
                    published = None
        if title:
            articles.append({
                "title": title,
                "url": url,
                "summary": (summary or "")[:320],
                "source": provider,
                "published": published,
            })
    return articles


def analyze_news(ticker: str, name: str, handle: Any | None = None) -> dict[str, Any]:
    now = time.time()
    cached = _CACHE.get(ticker)
    if cached and now - cached[0] < NEWS_CACHE_TTL:
        return cached[1]

    queries = [
        f"{name} {ticker} stock",
        f"{name} (earnings OR results OR guidance)",
        f'{name} (lawsuit OR investigation OR scandal OR fraud OR controversy OR "profit warning")',
        f"{name} site:ft.com OR site:reuters.com OR site:bloomberg.com OR site:cnbc.com",
    ]
    articles: list[dict[str, Any]] = []
    jobs = []
    if handle is not None:
        jobs.append(("yahoo", handle))
    for query in queries:
        jobs.append(("google", query))
    for source, feed in SOURCE_FEEDS:
        jobs.append(("rss", (source, feed)))

    def _run(job: tuple) -> list[dict[str, Any]]:
        kind, payload = job
        if kind == "yahoo":
            return _yahoo_news(payload)
        if kind == "google":
            return _google_news(payload)
        source, feed = payload
        first = name.split(" ")[0].lower()
        matched = []
        for item in _rss(feed, source):
            blob = f"{item['title']} {item.get('summary') or ''}"
            if _relevant(blob, ticker, name) or first in blob.lower():
                matched.append(item)
        return matched

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(_run, job) for job in jobs]
        for future in as_completed(futures):
            try:
                articles.extend(future.result())
            except Exception:
                continue

    company_tokens = name.lower()

    scored: list[dict[str, Any]] = []
    for item in _dedupe(articles):
        text = f"{item['title']} {item.get('summary') or ''}"
        if any(token in text.lower() for token in SPAM):
            continue
        if not _relevant(text, ticker, name) and ticker.lower() not in text.lower() and company_tokens.split(" ")[0] not in text.lower():
            continue
        flags, level = _flags(text)
        sentiment = _sentiment(text)
        scored.append({
            **item,
            "sentiment": round(sentiment, 2),
            "flags": flags,
            "risk": level,
        })

    scored.sort(key=lambda row: ({"severe": 0, "elevated": 1, "watch": 2, "none": 3}[row["risk"]], -abs(row["sentiment"])))
    scored = scored[:18]

    if not scored:
        result = {
            "score": 55.0,
            "sentiment": 0.0,
            "controversy": "none",
            "veto": False,
            "articles": [],
            "highlights": ["No recent company-specific headlines were retrieved."],
            "concerns": ["News coverage is thin, so external-risk confidence is limited."],
            "summary": "News scan returned little company-specific coverage.",
        }
        _CACHE[ticker] = (now, result)
        return result

    sentiments = [row["sentiment"] for row in scored]
    avg = sum(sentiments) / len(sentiments)
    severe = sum(1 for row in scored if row["risk"] == "severe")
    elevated = sum(1 for row in scored if row["risk"] == "elevated")
    watch = sum(1 for row in scored if row["risk"] == "watch")
    positive = sum(1 for row in scored if row["sentiment"] > 0.5)

    if severe:
        controversy = "severe"
    elif elevated >= 2:
        controversy = "elevated"
    elif elevated or watch >= 3:
        controversy = "watch"
    else:
        controversy = "none"

    score = 70 + avg * 8
    score -= severe * 22
    score -= min(elevated, 4) * 4
    score -= min(watch, 3) * 2
    score += min(positive, 4) * 3
    score = clamp(score)

    veto_terms = ("bankruptcy", "defaults on", "insolvency", "accounting scandal", "ponzi", "embezzle", "criminal charge")
    veto = any(
        row["risk"] == "severe" and any(token in " ".join(row["flags"]) for token in veto_terms)
        for row in scored
    )

    highlights = [row["title"] for row in scored if row["sentiment"] > 0.4][:3]
    concerns = [row["title"] for row in scored if row["risk"] in {"severe", "elevated"}][:4]
    if not highlights and avg >= 0:
        highlights = ["Headlines are mixed-to-neutral; no acute scandal language stood out."]
    if not concerns and controversy == "none":
        concerns = []

    result = {
        "score": round(score, 1),
        "sentiment": round(avg, 2),
        "controversy": controversy,
        "veto": veto,
        "articles": scored,
        "highlights": highlights,
        "concerns": concerns,
        "counts": {
            "total": len(scored),
            "severe": severe,
            "elevated": elevated,
            "watch": watch,
            "positive": positive,
        },
        "summary": (
            f"External-risk score {score:.0f}/100. Controversy level: {controversy}. "
            f"Scanned {len(scored)} company-linked headlines from Yahoo, Google News, FT, Reuters, and others."
        ),
    }
    _CACHE[ticker] = (now, result)
    return result


_DESK_CACHE_V = 5
_MARKET: tuple[float, dict[str, list[dict[str, Any]]]] | None = None

DESK_FEEDS = (
    ("Yahoo Finance", "https://finance.yahoo.com/news/rssindex", "tape"),
    ("MarketWatch", "https://feeds.marketwatch.com/marketwatch/topstories/", "tape"),
    ("MarketWatch", "https://feeds.marketwatch.com/marketwatch/marketpulse/", "tape"),
    ("CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", "tape"),
    ("CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", "tape"),
    ("Reuters Business", "https://feeds.reuters.com/reuters/businessNews", "headlines"),
    ("Reuters Business", "https://feeds.reuters.com/reuters/USmarketsNews", "tape"),
    ("Financial Times", "https://www.ft.com/rss/home", "headlines"),
    ("Financial Times", "https://www.ft.com/markets?format=rss", "tape"),
    ("Financial Times", "https://www.ft.com/companies?format=rss", "headlines"),
    ("BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml", "headlines"),
    ("CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258", "headlines"),
    ("Google News", "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en", "headlines"),
    ("Google News", "https://news.google.com/rss/search?q=stock+market+OR+nasdaq+OR+earnings+OR+merger&hl=en-US&gl=US&ceid=US:en", "tape"),
)

_FINANCE_TERMS = (
    "stock", "stocks", "share", "shares", "nasdaq", "nyse", "dow jones", "s&p",
    "stock market", "markets", "earnings", "revenue", "profit", "merger", "acquisition",
    "ipo", "the fed", "fed's", "federal reserve", "inflation", "interest rate", "bond", "bonds",
    "treasury", "yield", "bank", "banking", "ceo", "cfo", " sec", "regulation",
    "commodity", "commodities", "oil prices", "crude", "gdp", "economy", "economic",
    "investor", "dividend", "buyback", "guidance", "forecast", "wall street",
    "ftse", "nikkei", "hang seng", "ecb", "tariff", "takeover",
    "antitrust", "lawsuit", "layoff", "unemployment", "jobs report", "cpi",
    "etf", "futures", "bitcoin", "crypto", "analyst", "upgrade", "downgrade",
    "quarterly", "outlook", "corporate", "valuation", "hedge fund",
    "loan", "debt", "equity", "trading", "traders", "rally", "selloff",
    "sell-off", "index fund", "indexes", "indices", "earnings call",
    "market cap", "shares outstanding", "going public", "acquire", "m&a",
    "payrolls", "jobs data", "jobs figures", "s&p 500",
)

_TAPE_TERMS = (
    "nasdaq", "nyse", "dow", "s&p", "futures", "yield", "treasury", "oil",
    "gold", "bitcoin", "crypto", "rally", "selloff", "sell-off", "trading",
    "traders", "index", "indexes", "etf", "stock", "stocks", "shares",
    "wall street", "ftse", "nikkei", "commodity", "commodities", "vix",
    "bond", "bonds",
)

_HEADLINE_TERMS = (
    "earnings", "merger", "acquisition", "takeover", "ceo", "cfo", "lawsuit",
    "regulation", "antitrust", "bank", "banking", "ipo", "guidance", "dividend",
    "layoff", "inflation", "gdp", "unemployment", "jobs report", "tariff",
    "deal", "corporate", "company", "profit", "revenue", "sec", "federal reserve",
    "interest rate", "economy", "economic",
)

_EXCLUDE_TERMS = (
    "recipe", "celebrity", "oscars", "box office", "horoscope", "crossword",
    "football score", "premier league", "nba finals", "netflix show",
    "vacation", "hostel", "traveler", "traveller", "befriend", "scammer",
    "labor day sales", "add to your cart", "older people", "peace talks",
    "peace proposal", "midterm election", "masked protester", "hostels",
    "budget traveler", "social security", "skip college", "ad blitz",
    "labor day", "holiday closing", "holiday closings", "my reality",
    "stores are open", "polymarket", "lebron",
)

def _norm_title(title: str) -> str:
    text = (title or "").lower()
    text = re.sub(r"\s+[-–—|:]\s+[a-z0-9&.' ]{2,40}$", "", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _desk_dedupe(articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    seen: list[str] = []
    for item in articles:
        norm = _norm_title(item.get("title") or "")
        if len(norm) < 12:
            continue
        prefix = " ".join(norm.split()[:8])
        if any(norm[:48] == other[:48] or prefix == " ".join(other.split()[:8]) or norm.startswith(other[:40]) or other.startswith(norm[:40]) for other in seen):
            continue
        seen.append(norm)
        unique.append(item)
    return unique


def _has_term(blob: str, term: str) -> bool:
    if " " in term or len(term) >= 8:
        return term in blob
    return re.search(rf"\b{re.escape(term)}\b", blob) is not None


def _is_finance(item: dict[str, Any]) -> bool:
    blob = f"{item.get('title') or ''} {item.get('summary') or ''}".lower()
    if any(_has_term(blob, term) for term in _EXCLUDE_TERMS):
        return False
    return any(_has_term(blob, term) for term in _FINANCE_TERMS)


def _lane(item: dict[str, Any], source_lane: str) -> str:
    blob = f"{item.get('title') or ''} {item.get('summary') or ''}".lower()
    tape = 2 if source_lane == "tape" else 0
    head = 2 if source_lane == "headlines" else 0
    tape += sum(1 for term in _TAPE_TERMS if term in blob)
    head += sum(1 for term in _HEADLINE_TERMS if term in blob)
    return "tape" if tape >= head else "headlines"


def _slim_article(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": item.get("title"),
        "url": item.get("url"),
        "source": item.get("source"),
        "published": item.get("published"),
        "image": item.get("image"),
    }


def market_desk(limit: int = 20) -> dict[str, list[dict[str, Any]]]:
    global _MARKET
    now = time.time()
    if _MARKET and now - _MARKET[0] < NEWS_CACHE_TTL and _MARKET[1].get("_v") == _DESK_CACHE_V:
        cached = _MARKET[1]
        return {
            "tape": cached["tape"][:limit],
            "headlines": cached["headlines"][:limit],
            "results": (cached["tape"] + cached["headlines"])[: limit * 2],
        }

    tagged: list[tuple[str, dict[str, Any]]] = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {
            pool.submit(_rss, feed, source, 40): lane
            for source, feed, lane in DESK_FEEDS
        }
        for future in as_completed(futures):
            lane = futures[future]
            try:
                for item in future.result():
                    tagged.append((lane, item))
            except Exception:
                continue

    usable = [(lane, item) for lane, item in tagged if _is_finance(item)]
    usable.sort(key=lambda row: row[1].get("_ts") or 0, reverse=True)
    chosen = _desk_dedupe([item for _, item in usable])
    lane_of = {id(item): lane for lane, item in usable}

    tape: list[dict[str, Any]] = []
    headlines: list[dict[str, Any]] = []
    for item in chosen:
        dest = _lane(item, lane_of.get(id(item), "headlines"))
        card = _slim_article(item)
        if dest == "tape" and len(tape) < limit:
            tape.append(card)
        elif dest == "headlines" and len(headlines) < limit:
            headlines.append(card)
        if len(tape) >= limit and len(headlines) >= limit:
            break

    payload = {"tape": tape, "headlines": headlines, "_v": _DESK_CACHE_V}
    _MARKET = (now, payload)
    return {
        "tape": tape,
        "headlines": headlines,
        "results": tape + headlines,
    }


def market_headlines(limit: int = 24) -> list[dict[str, Any]]:
    desk = market_desk(max(12, limit // 2))
    return (desk.get("tape") or []) + (desk.get("headlines") or [])
