# 🔐 Security

## Reporting a problem
Please **don't open a public issue** for security problems. Use GitHub's **[private vulnerability reporting](https://github.com/nexoradev-stack/Custom-Email-Template-Builder-Gmail/security/advisories/new)** with steps to reproduce. We'll reply as soon as we can.

## How the project protects you
- Every API call needs a Google sign-in token from your Workspace domain, issued to this add-on's OAuth client. Admin rights come from a Google Group.
- Browser pages use short-lived, one-time tickets, never tokens in URLs.
- Strict Content-Security-Policy on every page. Email previews render in sandboxed iframes, so scripts in pasted code never run. Scripts and forms are removed from templates.
- *Copy into library* only fetches public `https` addresses (never private networks), follows at most 3 redirects, and accepts images up to 10 MB.

## Your responsibilities when you deploy
- Keep `env.yaml` private (it is git-ignored).
- The image bucket is **public** so recipients can load pictures. Don't upload anything private to it.
- Keep the admin group small.
