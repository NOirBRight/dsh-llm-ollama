# Changelog

## 0.6.11

- Support the DSH 0.1.2-alpha.1 Host image-pricing call while retaining neutral heuristic pricing
- Restore full published-RC and alpha1 client builds with a structural settings scope interface
- Check the built alpha1 adapter contract in CI

## 0.6.9

- Unify model catalog to opencode baseline (Context first row, Vision/Reasoning/Default thinking second row, 32/36px)

## 0.6.7

- Preserve ordinary chat image attachments on DSH 0.1.1-rc.2 by declaring its resolved request-image budgets
- Add a regression test for the rc.2 image-budget contract

## 0.6.6

- Own `prepareCall` so dsh 0.1.1-rc.2 Host can snapshot provider options before streaming
- Widen Host peer ranges to `>=0.1.0-rc.6 <0.1.1 || >=0.1.1-rc.1 <1.0.0`

## 0.6.5

- dsh RC1 compatibility

## 0.6.4

- Verify the eight-retry policy through resolved configuration and real Loader composition while preserving quota and unknown failures

## 0.6.3

- Classify documented status-less Ollama generation, reachability, and overload failures as retryable `SERVER` errors

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
