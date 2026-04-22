# Inventory Item Detail Redesign + Copies Model

**Date:** 2026-04-21  
**Status:** Approved  

---

## Overview

Rebuild `item.html` into a Collectr-style card detail page. Replace the current single-record stock model (online_stock / instore_stock counts) with a `copies` table — one row per physical card owned. Add a Product Details slide-out for managing individual copies, and a Mark as Sold flow that feeds into Analytics.

---

## Data Model

### New: `copies` table

One row per physical card owned. This is the source of truth for stock and cost basis.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| inventory_id | UUID | FK → inventory.id |
| condition | TEXT | NM, LP, MP, DMG |
| price_paid | NUMERIC(10,2) | What we paid for this copy |
| date_acquired | DATE | Defaults to today on insert |
| status | TEXT | `owned` or `sold` |
| sold_price | NUMERIC(10,2) | Filled when marked as sold |
| sold_date | DATE | Filled when marked as sold |
| sold_qty | INTEGER | Always 1 per copy row |
| notes | TEXT | Optional per-copy note |
| created_at | TIMESTAMPTZ | Auto |

### Changes to `inventory` table

- `online_stock`, `instore_stock`, `low_stock_threshold` columns are **deprecated as inputs** — stock counts are now derived from `copies WHERE status = 'owned'`
- All other columns remain: name, set_name, variant, category, condition (card-level default), price, img_url, grade, sale_channel, price_paid, date_acquired, notes
- `price` remains the selling price for the card

### Migration

Existing inventory records are migrated: for each record with `online_stock + instore_stock > 0`, create that many placeholder copy rows with `price_paid = inventory.price_paid`, `date_acquired = inventory.date_acquired`, `condition = inventory.condition`, `status = 'owned'`. Records with zero stock get no copies created.

---

## item.html — Page Layout

Three-column layout replacing the current layout.

### Left Column (190px)
- Card image
- Card name, set, variant, number
- Condition + category badges
- Your selling price + profit (price vs avg cost basis of owned copies)
- Stock count (derived from unsold copies)

### Center Column (flex)
- **Ungraded Price History chart** — Chart.js line chart, 1W/1M/3M/ALL range buttons, green line, shows market price low/high/current below chart
- **Graded Price History chart** — same style, shows PSA/BGS/CGC grade breakdown below chart

Both charts pull from `price_history` table. The graded chart only shows data if `inventory.grade` is set.

### Right Column (210px)
- **Market Price card** — shows ungraded NM market price, last synced time, "↻ Sync Market Price" button
- **Graded Market Prices** — table of PSA/BGS/CGC grades with market prices (pulled from Pokemon TCG API)
- **`···` button** — opens Product Details slide-out

---

## Product Details Slide-out

Slides in from the right when clicking `···`. Overlay dims the page behind it.

### Header
- Title: "Product Details"
- Subtitle: card name
- **Condition dropdown** (top-right): NM / LP / MP / DMG — sets the default condition for new copies added

### Copies List
- Section label "Your Copies" with count badge
- "+ Add Copy" button — adds a new copy row pre-filled with today's date and the header condition
- **Per copy card:**
  - Copy #N label + condition badge (color-coded)
  - 3-column grid: Paid | Acquired | Value
    - Value = inventory.price (selling price)
  - Profit badge: +$X profit (+Y%)
  - "Mark as Sold" button → opens Mark as Sold modal
  - "Edit" button → inline edit of price_paid, date_acquired, condition for that copy

### Footer Totals
- Total copies (count of owned)
- Total invested (sum of price_paid across owned copies)
- Total value (count × selling price)
- Unrealized profit (total value − total invested)
- "Save Changes" button

---

## Mark as Sold Modal

Triggered by "Mark as Sold" on any copy. Modal overlays the slide-out.

### Fields
- **Sold Price per Unit** — dollar input, placeholder "$ 0.00"
- **Quantity Sold** — number input, default 1 (capped at 1 per copy since each copy is one physical card)
- **Date Sold** — date input, **defaults to today's date**
- **Note** — textarea, optional

### Actions
- **"⊙ Mark as Sold"** — sets copy.status = 'sold', copy.sold_price, copy.sold_date, copy.notes. Records a sale event in Analytics.
- **"Cancel"** — dismisses modal, no changes

### Analytics Integration
Each sold copy creates a record in the `sales` table (or equivalent) with: inventory_id, copy_id, sold_price, sold_date, price_paid (for profit calculation), condition. This powers the Analytics page profit/revenue charts.

---

## API Changes

### New endpoints
- `GET /api/copies/:inventoryId` — list all copies for an item
- `POST /api/copies/:inventoryId` — add a new copy
- `PUT /api/copies/:copyId` — edit a copy (price_paid, date_acquired, condition)
- `POST /api/copies/:copyId/sell` — mark as sold (sold_price, sold_date, notes)
- `DELETE /api/copies/:copyId` — delete a copy

### Modified endpoints
- `GET /api/inventory` — add `copy_count` (unsold copies) to each row for stock display
- `GET /api/inventory/:id` — include copies array in response

---

## Files Changed

| File | Change |
|------|--------|
| `server.js` | Register new `/api/copies` router, add copies migration |
| `api/copies.js` | New file — all copy CRUD + sell endpoint |
| `admin/item.html` | Full rebuild — new 3-col layout, slide-out, mark as sold |
| `admin/admin.css` | New styles for item page, slide-out, copy cards |
| `api/inventory.js` | Add copy_count to GET / response |

---

## Out of Scope

- Inventory grid page (inventory.html) — not changing in this pass
- Graded cards page (graded.html) — not changing in this pass
- Analytics page — only receives new sale events, no UI changes
- CSV import — not changing
