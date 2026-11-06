# Auth email templates (Supabase → Authentication → Emails)

Sent through Resend SMTP from `Positive Rate <no-reply@mail.positiverateflying.com>`.

| Supabase template   | Subject                              | Body file   |
|---------------------|--------------------------------------|-------------|
| Magic link or OTP   | `Your Positive Rate code: {{ .Token }}`  | code.html   |
| Confirm sign up     | `Your Positive Rate code: {{ .Token }}`  | code.html (heading: "Welcome aboard — here's your code") |

The app signs in with the 6-digit code only (no links), so templates use `{{ .Token }}`.
