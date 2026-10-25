# Sets a secret on the live Cloudflare Pages project. You type the value hidden; it is sent straight to
# Cloudflare and never printed, logged or stored in this repo.
#   .\set-secret.ps1 ADMIN_PASSWORD
#   .\set-secret.ps1 RAZORPAY_KEY_ID
#   .\set-secret.ps1 RAZORPAY_KEY_SECRET
#   .\set-secret.ps1 RESEND_API_KEY
param([Parameter(Mandatory = $true)][ValidateSet('ADMIN_PASSWORD', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RESEND_API_KEY', 'MAIL_FROM')][string]$Name)

$secure = Read-Host "Value for $Name (hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if (-not $plain) { Write-Host 'Empty value, nothing changed.'; exit 1 }
  $plain | npx wrangler pages secret put $Name --project-name momoya
  Write-Host "`nDone. Secrets apply to the next deployment: run  npm run deploy  to pick it up."
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
