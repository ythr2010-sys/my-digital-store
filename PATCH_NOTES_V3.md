DigiVault v3 fixes:
- Product image upload now saves both imageUrl and imagePath and verifies getDownloadURL succeeds.
- Product page can recover the image URL directly from Storage using imagePath.
- Product page has error handling instead of remaining indefinitely on “جاري تحميل المنتج”.
- Reviews/comments no longer prevent the main product from rendering if one secondary query fails.
- Admin detection no longer blocks the initial product load.
- Image loading failure now shows a clear message instead of a black/blank image.
