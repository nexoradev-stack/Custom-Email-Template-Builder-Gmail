# 💰 What it costs to run

**Short answer:** for most companies, **a few cents to a few dollars a month**, and often **$0**.

## Do I need an AI API or an API key?

**No.** This project uses **no AI and no paid API**: no OpenAI, Gemini or Claude, and no tokens to buy. Nothing you or your users do is charged per word or per token.

It runs on ordinary Google Cloud services, and each of them has a **free monthly allowance**. A normal company stays inside most of it.

| What it uses | What it's for | Needs an API key? | Cost |
|---|---|---|---|
| Gmail add-on (Apps Script) | The panel inside Gmail | No | Included with Google Workspace |
| Cloud Identity Groups | Checks who is an admin | No | Free |
| **Cloud Run** | The engine: answers the panel, runs the editor, processes images, makes thumbnails | No | Free allowance, then pay per use |
| **Firestore** | Stores templates, versions, categories | No | Free allowance, then pay per use |
| **Cloud Storage** | The image library; people who receive your emails load pictures from here | No | A few cents per GB |
| **Artifact Registry** | Keeps a copy of each engine version you deploy | No | First 0.5 GB free, then $0.10 per GB a month |

> Everything is billed to **your own** Google Cloud project. There's no subscription and no per-user fee.

---

## Price list (us-central1, checked November 2026)

| Service | Free every month | After the free part |
|---|---|---|
| Cloud Run | 180,000 vCPU-seconds · 360,000 GiB-seconds · 2 million requests | $0.000024 per vCPU-second · $0.0000025 per GiB-second · $0.40 per million requests |
| Firestore | Per day: 50,000 reads · 20,000 writes · 20,000 deletes · 1 GiB stored | $0.03 per 100,000 reads · $0.09 per 100,000 writes · $0.01 per 100,000 deletes |
| Cloud Storage | — | $0.020 per GB stored a month · about $0.12 per GB sent to the internet |
| Artifact Registry | 0.5 GB | $0.10 per GB a month |

Prices change from time to time. Always check the official pages: [Cloud Run](https://cloud.google.com/run/pricing) · [Firestore](https://cloud.google.com/firestore/pricing) · [Cloud Storage](https://cloud.google.com/storage/pricing) · [Artifact Registry](https://cloud.google.com/artifact-registry/pricing)

> ℹ️ Free allowances are shared by **all projects on the same billing account**. If other apps already use them, see the "no free allowance" column below.

---

## Three example companies

What we assumed for each person, per month:
- opens the gallery about **10 times**, and customises or adds a template a couple of times
- that's about **50 requests** to the engine, **25 seconds** of engine work, and **400** database reads

What we assumed for emails: each email that is **opened** loads about **0.4 MB** of pictures.

| | 🟢 Small team | 🔵 Mid-size company | 🟣 Large company |
|---|---|---|---|
| People using it | 50 | 500 | 5,000 |
| Emails opened per month | 1,000 | 10,000 | 100,000 |
| **Cloud Run** | $0.00 | $0.00 | $0.00 |
| **Firestore** | $0.00 | $0.00 | $0.15 |
| **Cloud Storage** (pictures sent) | $0.05 | $0.48 | $4.80 |
| **Cloud Storage** (pictures stored) | $0.02 | $0.02 | $0.05 |
| **Artifact Registry** (last 3 versions kept) | $0.15 | $0.15 | $0.15 |
| **Per week** | **≈ $0.05** | **≈ $0.15** | **≈ $1.20** |
| **Per month** | **≈ $0.22** | **≈ $0.65** | **≈ $5.15** |
| **Per year** | **≈ $2.60** | **≈ $7.80** | **≈ $62** |
| Per month if the **free allowance is already used** by other projects | ≈ $0.30 | ≈ $1.10 | ≈ $9.30 |

*Week = month ÷ 4.33. Year = month × 12. All in US dollars.*

### Where the money goes
- **Pictures in emails** are the main cost. It grows with how many emails are opened and how heavy the pictures are.
- **Old engine versions** come next if you deploy often (see the tip below).
- **The engine and database** usually cost nothing, because use stays inside the free part.

---

## Work out your own cost in 2 minutes

1. **Pictures:** emails opened per month × MB of pictures per email ÷ 1,000 × $0.12

   *Example: 20,000 opens × 0.5 MB ÷ 1,000 × $0.12 = **$1.20 a month***

2. **Engine (only if you're over the free part):** people × 25 seconds = vCPU-seconds. Subtract 180,000. Multiply what's left by $0.000024, and add about 20% for memory.

   *Example: 10,000 people × 25 = 250,000 → 70,000 over → × $0.000024 = $1.68 + 20% ≈ **$2.00 a month***

3. **Database:** people × 400 reads ÷ 30 = reads per day. Anything over 50,000 a day costs $0.03 per 100,000.

   *Example: 5,000 people → 66,700 a day → 16,700 over × 30 days = 500,000 → **$0.15 a month***

4. **Add $0.15** for keeping the last 3 engine versions.

5. **Total for the month.** Divide by 4.33 for a week, or multiply by 12 for a year.

---

## Optional: no waiting on the first click

By default the engine sleeps when nobody uses it, so it costs nothing. The first click after a quiet spell takes 2–3 extra seconds while it wakes up.

To keep one copy always awake, add `--min-instances 1` when you deploy. An idle copy is charged at $0.0000025 per vCPU-second and $0.0000025 per GiB-second, so with 1 vCPU and 2 GiB that adds about **$4.50 a week / $19.50 a month**.

---

## 💡 Tips to keep it at nearly $0

**Keep only the last 3 engine versions.** Every deploy stores a full copy (several hundred MB), and they pile up. Run this once:

```bash
cat > cleanup.json <<'EOF'
[
  {"name": "keep-last-3", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 3}},
  {"name": "delete-older", "action": {"type": "Delete"}, "condition": {"olderThan": "30d"}}
]
EOF
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --project=YOUR_PROJECT --location=us-central1 --policy=cleanup.json
```

**Make pictures lighter.** The image library already shrinks big uploads. Aim for under 300 KB per picture, and avoid huge animated GIFs.

**Set a budget alert.** In Google Cloud go to **Billing → Budgets & alerts → Create budget**, choose your project, set an amount (for example $10 a month) and an email alert at 50%, 90% and 100%. You'll know straight away if anything changes.

**See the real numbers.** **Billing → Reports**, filtered by your project, shows the cost per service each day.
