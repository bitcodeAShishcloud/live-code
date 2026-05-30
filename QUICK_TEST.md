# 🧪 Quick Test Guide - File Rename

## Test 1: Double-Click Rename ✅

**Steps:**
1. Open the app in your browser
2. Look at the editor tabs (top of editor area)
3. **Double-click** on "index.html" text
4. You should see an input field appear
5. Type "home"
6. Press **Enter**
7. ✅ Should see toast: "Renamed to home.html"

**Expected Result:**
- Input field appears with "index" selected
- Extension ".html" is preserved
- Both editor tab and file sidebar update
- Toast notification shows success

---

## Test 2: F2 Keyboard Shortcut ✅

**Steps:**
1. Click on any file tab to make it active (e.g., "styles.css")
2. Press **F2** key on your keyboard
3. You should see an input field appear
4. Type "theme"
5. Press **Enter**
6. ✅ Should see toast: "Renamed to theme.css"

**Expected Result:**
- Input field appears immediately
- Text "styles" is selected
- Extension ".css" is preserved
- Rename completes successfully

---

## Test 3: Cancel Rename ✅

**Steps:**
1. Double-click on "script.js"
2. Input field appears
3. Type "test"
4. Press **Escape** key
5. ✅ Name should revert to "script.js"

**Expected Result:**
- Rename is cancelled
- Original name is restored
- No toast notification

---

## Test 4: Duplicate Name Detection ✅

**Steps:**
1. Note existing file names (e.g., "index.html", "styles.css")
2. Double-click on "script.js"
3. Type "index" (without extension)
4. Press **Enter**
5. ✅ Should see error toast: "A file with this name already exists"

**Expected Result:**
- Error toast appears
- Rename is cancelled
- Original name is kept

---

## Test 5: Extension Preservation ✅

**Steps:**
1. Double-click on "index.html"
2. Type "homepage" (no extension)
3. Press **Enter**
4. ✅ File should be renamed to "homepage.html" (not "homepage")

**Expected Result:**
- Extension is automatically added
- Toast shows full name with extension

---

## Test 6: Multiple Dots in Filename ✅

**Steps:**
1. Create a new file named "app.test.js"
2. Double-click on "app.test.js"
3. Type "utils.test"
4. Press **Enter**
5. ✅ Should rename to "utils.test.js"

**Expected Result:**
- Only the last extension is preserved
- Middle dots are part of the name

---

## Test 7: Blur to Confirm ✅

**Steps:**
1. Double-click on any file
2. Type a new name
3. Click anywhere outside the input (don't press Enter)
4. ✅ Rename should complete automatically

**Expected Result:**
- Blur event triggers rename
- Toast notification appears
- Name is updated

---

## Test 8: F2 on Active File ✅

**Steps:**
1. Click on "index.html" tab to make it active
2. Press **F2**
3. ✅ Input should appear on "index.html"
4. Press **Escape** to cancel
5. Click on "styles.css" tab
6. Press **F2**
7. ✅ Input should appear on "styles.css"

**Expected Result:**
- F2 always renames the active file
- Works regardless of which file is active

---

## Test 9: Quick Succession Renames ✅

**Steps:**
1. Double-click "index.html" → rename to "home" → Enter
2. Immediately double-click "styles.css" → rename to "home-styles" → Enter
3. Immediately press F2 → rename to "homepage-styles" → Enter
4. ✅ All renames should work without issues

**Expected Result:**
- No race conditions
- All renames complete successfully
- No errors or glitches

---

## Test 10: Mobile Double-Tap ✅

**Steps (on mobile device or mobile emulator):**
1. Open app on mobile
2. Tap file tab to open it
3. **Double-tap** on the file name
4. Mobile keyboard should appear
5. Type new name
6. Tap outside or press Enter
7. ✅ Rename should complete

**Expected Result:**
- Double-tap triggers rename
- Mobile keyboard appears
- Rename works smoothly

---

## 🎯 All Tests Passing?

If all tests pass, you should see:
- ✅ Double-click works reliably
- ✅ F2 keyboard shortcut works
- ✅ Escape cancels rename
- ✅ Extension is preserved
- ✅ Duplicate detection works
- ✅ Blur confirms rename
- ✅ Multiple renames work
- ✅ Mobile support works

---

## 🐛 Troubleshooting

### Issue: Double-click doesn't work
**Solution:** 
- Make sure you're clicking the **file name text**, not the icon or close button
- Try clicking slower (not too fast)
- Check browser console for errors

### Issue: F2 doesn't work
**Solution:**
- Make sure a file tab is active (clicked)
- Try clicking the tab first, then pressing F2
- Check if F2 is mapped to something else in your browser

### Issue: Input doesn't appear
**Solution:**
- Refresh the page (Ctrl+R or Cmd+R)
- Check browser console for JavaScript errors
- Make sure JavaScript is enabled

### Issue: Extension disappears
**Solution:**
- This is normal! Extension is preserved automatically
- Just type the name without extension
- The full name with extension will appear after rename

---

## 🎉 Success!

If all tests pass, the file rename feature is working perfectly! 

**Key Features Working:**
- ✅ Event delegation (no memory leaks)
- ✅ Dynamic element lookup (no stale references)
- ✅ F2 keyboard shortcut (professional UX)
- ✅ Extension preservation (smart behavior)
- ✅ Duplicate detection (prevents errors)
- ✅ Mobile support (touch-friendly)

---

**Happy Renaming! 🚀**
