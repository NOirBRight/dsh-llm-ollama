# Changelog

## 0.6.2

- Retry model requests up to eight times by default; provider configuration can override the budget

## 0.6.1

- Show official reset time under Cloud usage bars when the endpoint reports one; otherwise show the documented 5-hour session / 7-day weekly period
- Rename Settings nav/title from Providers to LLM Providers / LLM 供应商

## 0.6.0

- Move the settings card from Plugins to Settings → Providers
- The Providers nav row is claimed by the first installed provider plugin and disappears when all of them are uninstalled
- Collapsed cards show a short connection status and model count
- Usage refresh shows a skeleton, a spinning official refresh glyph, a failure hint next to the button, and a last-updated clock
