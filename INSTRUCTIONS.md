# How to run Dilagent

Read this first. You only need two files: **setup.bat** once, then **run.bat** every time after that.

## Before you start

Install **Python 3.10 or newer** from https://www.python.org/downloads/

On the installer, tick **Add python.exe to PATH**, then click Install.

## First time only

1. Put this folder on your computer (clone the repo, or unzip the download).
2. Open the folder.
3. Double-click **setup.bat**.
4. If Windows warns you, click **More info** and then **Run anyway**.
5. Wait while it installs packages. The first time can take a few minutes.
6. Your browser should open Dilagent at http://127.0.0.1:8000
7. Leave the black window open while you use the desk. Close that window to stop.

Do not run setup.bat again unless something is broken or you deleted the `spvenv` folder.

## Every time after that

1. Open this folder.
2. Double-click **run.bat**.
3. Wait for the browser to open http://127.0.0.1:8000
4. Leave the black window open. Close it when you are done.

That is the normal way to start Dilagent.

## If something goes wrong

- **Python was not found** — install Python 3.10+ and tick Add python.exe to PATH, then run **setup.bat** again.
- **Packages failed to install** — check your internet connection and run **setup.bat** again.
- **The page looks old after an update** — press Ctrl+F5 in the browser.
- **You deleted spvenv or the desk will not start** — run **setup.bat** once, then go back to **run.bat**.

## Optional written briefing

The desk works without an API key. To get a written briefing, open `.env` in this folder and add a Groq or OpenAI key, then restart with **run.bat**.

## Mac and Linux

First time: `chmod +x setup.sh run.sh` then `./setup.sh`

Every time after that: `./run.sh`

## Not investment advice

Dilagent is for learning. You are responsible for any decision you make.
