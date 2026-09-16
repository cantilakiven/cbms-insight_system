# Security persistence fix v9

Fixed authentication startup failure where an existing AES-256-GCM authentication record could not be decrypted after `npm run electron:dev` restart.

Key changes:
- Authentication decryption now tries all recoverable key sources: Electron safeStorage-protected key and stable dev fallback key.
- A new random key is never created while an existing authentication blob is being verified.
- Failed recovery still fails closed; the app never silently disables the PIN.
- When a recoverable fallback key works, the next successful authentication save can converge the record back to the preferred OS-protected key.
