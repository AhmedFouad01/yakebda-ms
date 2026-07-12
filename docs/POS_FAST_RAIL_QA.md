# POS Fast Rail — QA Acceptance Matrix

## Structural rules

- AppShell contains shift state, product search, and shift-order history only.
- Order type and order source remain in the cart Order Rail.
- No runtime DOM relocation or MutationObserver is used.
- The cart uses one scrolling surface; totals and submit remain visible.
- Missing order source displays an em dash instead of a misleading zero total.

## Cart-line rules

- Product image/fallback, name, choices, price, quantity, notes, and removal action have fixed visual roles.
- Quantity controls meet a 44px touch target.
- Notes stay collapsed until requested or populated.
- Destructive actions use the danger semantic color, not the brand accent.

## Required manual viewports

- 1920×1080 at 100%, 125%, and 150% Windows scaling.
- 1366×768 at 100% scaling.
- 1280×720 at 100% scaling.

## Required operating checks

1. Add ten mixed products, including products without images.
2. Increase/decrease quantity and delete a line.
3. Add and edit item notes.
4. Switch Takeaway/Delivery and verify source reset.
5. Verify total remains `—` until a source is selected.
6. Complete Delivery customer/address/phone/zone validation.
7. Open shift controls, product search, and shift history from AppShell.
8. Verify `/`, `F2`, and `F4` keyboard shortcuts.
9. Confirm KDS and product-card behavior are unchanged.

## Automated gate

- `npm ci`
- `npm run api:test`
- `npm run admin:build`
