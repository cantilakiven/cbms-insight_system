# MutiaLytics Release Checklist

1. Test `npm run electron:dev`.
2. Test the packaged installer on Windows, including security PIN, exports, print preview, and physical printer output.
3. Update `package.json` version.
4. Commit and push to `main`.
5. Create and push the matching tag: `v<package-version>`.
6. Confirm GitHub Actions finishes successfully.
7. In the GitHub Release, verify the NSIS `.exe`, `latest.yml`, and `.blockmap` assets exist.
8. Install the new `.exe` on a clean test workstation.
9. Open the installed application and confirm it detects the newer GitHub release on the next update check.
10. Keep the previous release available so coworkers on the old version have a valid update target.
