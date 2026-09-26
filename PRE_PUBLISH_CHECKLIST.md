# DigiVault — Pre-Publish Checklist

## Must be completed in Firebase Console
1. Enable Email/Password and Google Authentication.
2. Configure authorized domains for the production site.
3. If large file uploads are required, enable Cloud Storage and the billing plan required by Firebase for Storage.
4. Publish `firestore.rules` and `storage.rules`.
5. Restrict the Firebase Web API key by HTTP referrers and required APIs in Google Cloud.
6. Configure App Check for the production web app.
7. Create/verify the administrator account and `admins/{email}` document if using additional admins.
8. Test product submission, approval, rejection, edit/resubmit, free purchase, paid order, and admin file inspection.
9. Connect a real payment provider before accepting real money. The static site cannot verify card/payment success by itself.
10. Add a production privacy policy, terms, refund policy, and seller/content policy appropriate to the operator's jurisdiction.

## File delivery
- Small embedded files are a fallback only.
- Large files should use Cloud Storage or a reliable external file host.
- Paid file access should be granted only after server-side/payment-provider verification.
- External download links may not support automatic HEAD/CORS checks; the admin UI reports this instead of falsely claiming success.

## Recommended operational controls
- Back up Firestore data.
- Monitor Storage/Firestore usage and billing alerts.
- Keep an admin audit trail for approvals/rejections and order actions.
- Add a support/contact process and a clear refund policy before launch.
