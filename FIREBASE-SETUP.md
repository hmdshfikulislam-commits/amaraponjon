# Firebase setup

The app uses email/password and Google Authentication for regular visitors, email/password Authentication for administrators, plus Cloud Firestore and Cloud Storage. The Firebase Web app configuration is set in `firebase-config.js`; authentication, shared reports, photo uploads, and moderation still require the Firebase Console setup and published rules below.

## 1. Create a Firebase project and web app

1. The registered Firebase project is `amaraponjon-ebd3e`; verify that the matching Web app config in `firebase-config.js` is current. Use the exact `storageBucket` shown in the console; older projects may use a bucket ending in `appspot.com`.
3. The web API key in this file is a public client identifier, not an admin secret. Do not put service-account keys or private server credentials in this project.

## 2. Enable visitor sign-in

1. In **Authentication → Sign-in method**, enable **Email/Password** and **Google**.
2. In **Authentication → Settings → Authorized domains**, add the hostname used to open this site, such as `localhost`, and the production hostname before deployment.
3. Serve the files from an HTTP(S) web server. Do not open `index.html` as a `file://` URL. A VS Code Live Server extension is suitable for local testing; use HTTPS for a deployed site.
4. Configure the Google provider's support email and authorized domains in Firebase Authentication.

## 3. Enable administrator sign-in

1. Keep **Email/Password** enabled in **Authentication → Sign-in method**. Public registration is available to regular visitors, but do not create an administrator registration form.
2. In **Authentication → Users**, create the administrator account for `hmdshfikulislam@gmail.com` with a strong, unique password. This address is the intended Admin Email; authorization still requires the private Firestore allowlist, and the email is not embedded in the public client.
3. Open `admin/login.html` through the deployed site (or `/admin/login.html` locally) and sign in with that account. If its email is not verified, the page sends a verification email and signs out; follow the link, then sign in again.
4. Create the administrator allowlist document as described in section 5. Only users whose verified Firebase email matches that document can administer the site.

## 4. Create Firestore and Storage

1. Create a Cloud Firestore database.
2. Create the default Cloud Storage bucket and ensure Storage is linked to the project's default Firestore database so Storage Rules can check report ownership and verification.
3. In **Firestore → Rules**, publish the contents of `firestore.rules`.
4. In **Storage → Rules**, publish the contents of `storage.rules`.
5. When Firestore offers to create the composite index for the verified-post query, create it (`verified` ascending, `createdAt` descending).

The rules allow a signed-in user to submit an unverified report and read their own report. Every new report stays unverified until an admin approves it. In the Admin panel, reports that pass the client-side checks (name, location, photo, description, and no listed keyword matches) appear in green with an Approve action; reports with any check issue appear in red with the reason and a Delete action. These browser-side checks and the client-provided `pendingReason` are untrusted review hints, not security validation or automatic approval. Keyword checks can produce false positives, so admins must review the actual report. Only verified reports are visible to signed-in users. Only an admin listed in the private `admins` collection can read pending reports, approve them, or delete them. Storage limits report photos to image files smaller than 5 MB.

The repeated-submission check looks for two existing reports from the same account in the last 10 minutes. Create the Firestore composite index for `posts` with `createdBy` ascending and `createdAt` ascending when prompted; the report submission query needs it.

Donation reports are stored in the `donations` collection. Signed-in users can submit a pending donation report with its selected route; only admins can read these records. The public donation dialog currently displays the supplied bKash, Nagad, upay, and Rocket number and account name. It does not confirm a payment; admins must verify each report. The Islami Bank account number has not been supplied, so bank transfers remain unavailable until the correct account details are added.

Lost/found location pickers use the Bangladesh geocode JSON dataset bundled at `public/bd.json` (8 divisions, 64 districts, and 494 upazilas). The source repository's JSON files are under `divisions/divisions.json`, `districts/districts.json`, and `upazilas/upazilas.json`; the JSON endpoints in the original request pointed to paths that return 404. The bundled data retains the source link and Bengali names; village/union/ward is entered by the user because the picker only includes upazila-level data.

## 5. Authorize administrators

1. In **Authentication → Users**, copy the UID of the verified administrator account.
2. In **Firestore → Data**, create a document at `admins/{UID}` with one string field named `email` set to `hmdshfikulislam@gmail.com`. Use the UID of the verified Firebase Auth account for that email.
3. Only create this document yourself in the Firebase Console. The published Firestore rules deny clients permission to create, edit, delete, or list admin documents.

The allowlist is kept in Firestore rather than in public browser code. Both Firestore and Storage Rules require a verified Firebase email and an exact email match in the UID-specific admin document. The static `/admin/login.html` and `/admin/index.html` pages use client-side routing for convenience, but the rules—not the page visibility—protect private records and moderation actions. Visitors use email/password or Google sign-in; phone/OTP authentication is not used.

Firebase Authentication applies its own abuse protections and throttling. The login page also adds a per-browser cooldown after repeated failures as a usability deterrent; local browser storage can be cleared or bypassed, so this is not a security boundary. A global/IP-based lockout requires server-side enforcement, which this static-only site does not have.

## 6. Run and deploy

Open the project through a local HTTP server (for example, VS Code Live Server) and use its `http://localhost:...` URL. Keep that host in Firebase's Authorized domains. For production, deploy the static files over HTTPS and add the production hostname to Authorized domains.

`firebase-config.js` contains only the Firebase Web app configuration; access control is enforced by `firestore.rules` and `storage.rules`, not by hiding the client config. Review Firebase's current pricing and quotas before deploying Storage.
