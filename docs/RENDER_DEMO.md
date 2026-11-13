# Free live demo on Render (game + dashboard)

For a reviewer to play, give feedback, and see it on the dashboard. Free, no card needed.
**Demo only:** the free server sleeps after 15 minutes without use, and when it sleeps or redeploys
**all recorded data is wiped**. Check the dashboard in the same sitting as the play-through.

## Set up (about 15 minutes, once)

1. Go to https://render.com and sign up with GitHub (the account that owns the repo).
2. **New → Blueprint** → choose `sql_missing_influencer_gamified` → branch `main`.
3. Render shows two services and asks for two values:
   - `ADMIN_PASSWORD`: the dashboard password you choose.
   - `VITE_ANALYTICS_URL`: `https://tmi-analytics-demo.onrender.com`
4. Click **Apply** and wait until both services say **Live** (the game takes about 3-5 minutes to build).
5. Check the address: open **tmi-analytics-demo** in Render and look at its URL at the top.
   - If it is exactly `https://tmi-analytics-demo.onrender.com`, you are done.
   - If it is different (for example `...-abcd.onrender.com`), open **tmi-game-demo → Environment**,
     set `VITE_ANALYTICS_URL` to that exact URL, save, then **Manual Deploy → Clear build cache & deploy**.

## Links to give the reviewer

| What | Link |
|---|---|
| Game | the **tmi-game-demo** URL (e.g. `https://tmi-game-demo.onrender.com`) |
| Dashboard | the **tmi-analytics-demo** URL, with the password from step 3 |

## Test it yourself first

1. Open the dashboard link once and wait for the login (the first open can take ~1 minute while it wakes up).
2. Open the game, enter a name and an NxtWave ID, play a few steps, give a chapter check-in.
3. Log in to the dashboard → **Students** → your ID: progress, time per chapter, and feedback appear.

## Updating

Push to `main` and Render rebuilds both automatically (this wipes the demo data).
