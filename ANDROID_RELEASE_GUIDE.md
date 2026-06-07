# 🚀 SpiceStrong Android Release — Hands-Free Guide

**One command to build, test, and upload to Google Play Store.**

---

## 📋 Prerequisites (One-Time Setup)

### 1. Generate Android Keystore (if you don't have one)

```bash
keytool -genkey -v -keystore android/app/release-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias release \
  -storepass YOUR_PASSWORD \
  -keypass YOUR_PASSWORD
```

Save the passwords somewhere safe!

### 2. Get Google Play Service Account

1. Go to **Google Play Console** (https://play.google.com/console)
2. Select your app
3. Go to **Setup → API Access**
4. Click **Create Service Account**
5. Follow the link to Google Cloud Console
6. Create a new Service Account:
   - Name: `SpiceStrong-Release`
   - Grant roles: `Editor` (for publishing)
7. Create a JSON key
8. Download the JSON file
9. Save it as: `google-service-account.json` (in project root)
10. **Add to `.gitignore`** (already there ✅)

### 3. Create `.env` File

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Then edit `.env`:

```
# Supabase (from earlier)
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-key

# Android Signing
ANDROID_KEYSTORE_PATH=./android/app/release-keystore.jks
ANDROID_KEYSTORE_PASSWORD=your-keystore-password
ANDROID_KEY_ALIAS=release
ANDROID_KEY_PASSWORD=your-key-password

# Google Play Upload
GOOGLE_PLAY_SERVICE_ACCOUNT=./google-service-account.json
```

---

## 🎯 Hands-Free Release (One Command)

```bash
npm run android:release
```

This script automatically:
1. ✅ Validates all credentials
2. ✅ Increments build number
3. ✅ Builds Android APK with EAS
4. ✅ Runs database audit tests
5. ✅ Uploads to Google Play Store
6. ✅ Reports status

**That's it!** No manual steps.

---

## 📊 What Happens Step-by-Step

```
npm run android:release
    ↓
├─ 1️⃣  Validate Setup
│   ├─ Check .env file exists
│   ├─ Check all env vars set
│   ├─ Check keystore file
│   ├─ Check service account
│   └─ Check app.json
│
├─ 2️⃣  Increment Build Number
│   └─ app.json: versionCode 63 → 64
│
├─ 3️⃣  Build APK with EAS
│   └─ eas build --platform android --wait (15-30 min)
│
├─ 4️⃣  Run Tests
│   └─ npm run test:db:audit (2-5 min)
│
├─ 5️⃣  Upload to Play Store
│   └─ eas submit --platform android --latest
│
└─ ✅ Release Complete!
   Build #64 uploaded to Google Play Store
```

---

## ⚡ Individual Commands (if needed)

```bash
# Just build the APK
npm run android:build

# Just submit to Play Store
npm run android:submit

# Full hands-free release
npm run android:release
```

---

## 🔍 Troubleshooting

### "Missing .env file"
→ Create it: `cp .env.example .env` and fill in values

### "Keystore file not found"
→ Generate one (see Prerequisites #1 above)

### "Service account not found"
→ Download from Google Play Console (see Prerequisites #2 above)

### "Build failed"
→ Check EAS logs: `npm run android:build` (manually run to see error)

### "Upload failed"
→ Verify service account has correct permissions in Google Cloud Console

### "Tests failed"
→ Fix the failing test first, then retry release

---

## 📝 Before Release Checklist

- [ ] `.env` file created with all credentials
- [ ] `android/app/release-keystore.jks` exists
- [ ] `google-service-account.json` exists
- [ ] Credentials in `.env` are correct
- [ ] `npm run test:db:audit` passes locally
- [ ] App version updated in `app.json` (if needed)

---

## 🚀 Release Day Workflow

```bash
# 1. Verify everything is ready
npm run test:db:audit

# 2. One-command release
npm run android:release

# 3. Monitor upload in Google Play Console
# (usually takes 30 min - 2 hours to review)

# 4. Check for crashes
# (monitor error logs for first 24 hours)
```

---

## 📊 File Locations

```
SpiceStrong/
├── .env                          ← Credentials (never commit!)
├── .env.example                  ← Template (safe to commit)
├── google-service-account.json   ← Downloaded (never commit!)
├── android/app/
│   └── release-keystore.jks      ← Generated (never commit!)
├── app.json                      ← Version config
├── scripts/
│   └── android-release.js        ← Automation script
└── package.json                  ← NPM scripts
```

---

## ✅ Success Indicators

**Build successful if you see:**
```
✅ Keystore file found: ./android/app/release-keystore.jks
✅ Service account found: ./google-service-account.json
✅ All required environment variables set
✅ Build number incremented: 63 → 64
✅ Android APK built successfully
✅ All tests passed
✅ Successfully uploaded to Google Play Store
✅ Android Release Complete!
   Build #64 uploaded to Google Play Store
```

---

## 🔐 Security Reminder

**NEVER commit these files:**
- `.env` (contains passwords)
- `google-service-account.json` (Google credentials)
- `android/app/release-keystore.jks` (signing key)

They're already in `.gitignore` ✅

---

## 🤔 FAQ

**Q: How long does the full release take?**  
A: ~30-45 minutes (15-30 min build + 2-5 min tests + 5-10 min upload)

**Q: Can I stop it halfway?**  
A: Press Ctrl+C to cancel. Build number will be rolled back.

**Q: What if tests fail?**  
A: Script stops before uploading. Fix the issue and try again.

**Q: What if upload fails?**  
A: Check Google Play Console for validation errors. Fix and retry `npm run android:submit`

**Q: Do I need Android Studio?**  
A: No! EAS handles everything. Just need the credentials.

---

## 📞 Support

If something fails:
1. Check the error message
2. See Troubleshooting section above
3. Run individual commands to debug

---

**Ready?** Just run:
```bash
npm run android:release
```

🚀

---

Last updated: 2026-06-06
