# Milking Dashboard Design Spec

**Date:** 2026-08-17  
**Author:** Claude Code  
**Status:** Approved

---

## Executive Summary

Build a facility-scoped milking data dashboard enabling staff to visualize production trends, monitor herd health, and drill down into detailed records. The system processes ~2,400+ records per day (3 shifts × ~40 cows) via on-demand aggregation from raw MongoDB records, supporting instant data availability after import completion.

---

## Problem Statement

Currently, milking data is imported from Excel but inaccessible for analysis. Staff need to:
- See overall production trends (daily/weekly/monthly) at a glance
- Identify underperforming shifts or groups
- Drill down to specific cows or time periods
- Export or review detailed records
- Respond to production anomalies in real-time

**Performance constraint:** With 2,400+ records/day × multiple facilities, naive table pagination causes unacceptable latency. Solution: Separate summary (instant) from details (paginated).

---

## Solution Architecture

### Data Layer

**Collections:**

1. **milking_records** (existing, enhanced indexing)
   - Fields: `_id`, `facility`, `cow`, `cowGroup`, `currentGroup`, `milkingShift`, `milk`, `milkSessionAt`, `createdAt`, `updatedAt`
   - Indexes (new):
     ```javascript
     { facility: 1, milkSessionAt: 1 }
     { facility: 1, cowGroup: 1, milkSessionAt: 1 }
     { facility: 1, cow: 1, milkSessionAt: 1 }
     ```
   - Purpose: Raw data source for on-demand aggregation

2. **Cow** (existing, used for lookups)
   - Used to fetch dropdown options: `GET /cows?facility=<facilityId>`

3. **CowGroup** (existing, used for lookups)
   - Used to fetch group options: `GET /cow-groups?facility=<facilityId>`

---

### Backend API

#### Endpoint 1: Summary (Aggregated Stats & Chart Data)

**Request:**
```
GET /milking-data/summary?
  startDate=2026-08-01
  endDate=2026-08-31
  groupId=<ObjectId>        (optional)
  cowId=<ObjectId>          (optional)
  shift=Morning|Afternoon|Evening (optional)
```

**Response (200 OK):**
```json
{
  "daily": [
    {
      "date": "2026-08-31",
      "totalMilk": 1024.5,
      "recordCount": 150,
      "byShift": {
        "Morning": 342.1,
        "Afternoon": 341.2,
        "Evening": 341.2
      },
      "byGroup": {
        "2.1": 512.3,
        "3.3": 512.2
      }
    }
  ],
  "stats": {
    "totalMilk": 30735.0,
    "avgPerCow": 7.2,
    "recordCount": 2433,
    "cowsReporting": 35,
    "groupsActive": 3
  }
}
```

**Implementation:**
- MongoDB aggregation pipeline (no pre-computed collection)
- `$match` on facility, date range, optional filters (groupId, cowId, shift)
- `$group` by date and shift (or group, depending on filter)
- Returns instant results via index lookups

**Error Handling:**
- 400: Invalid date format or filter
- 401: Unauthorized (facility scope check)
- 500: Aggregation pipeline error

---

#### Endpoint 2: Records (Paginated Detail Table)

**Request:**
```
GET /milking-data/records?
  startDate=2026-08-01
  endDate=2026-08-31
  groupId=<ObjectId>        (optional)
  cowId=<ObjectId>          (optional)
  shift=Morning|Afternoon|Evening (optional)
  sortBy=date|milk|cowId    (default: date)
  sortOrder=asc|desc        (default: desc)
  limit=50
  offset=0
```

**Response (200 OK):**
```json
{
  "records": [
    {
      "id": "...",
      "cowsId": "232",
      "currentGroup": "2.1",
      "shift": "Morning",
      "milk": 6.81,
      "milkSessionAt": "2026-07-31T00:00:00Z",
      "createdAt": "2026-08-13T12:32:36.245Z"
    }
  ],
  "total": 2433,
  "limit": 50,
  "offset": 0
}
```

**Implementation:**
- Query `milking_records` with `$match` filters
- Apply sorting
- Paginate with `$skip` and `$limit`
- Return Cow.cowsId and CowGroup data for display (via population or aggregation $lookup)

**Error Handling:**
- 400: Invalid pagination (limit > 500 rejected)
- 401: Unauthorized
- 500: Query error

---

#### Endpoint 3: Lookup Lists (for filter dropdowns)

**Request (existing or new endpoints):**
```
GET /cow-groups?facility=<facilityId>
GET /cows?facility=<facilityId>&search=<optional>
```

**Purpose:** Populate filter dropdown selectors dynamically.

---

### Frontend Layer

#### New Page: `MilkingDashboardPage.jsx`

**Route:** `/milking-data` (or `/dashboard/milking`)

**Component Structure:**
```
MilkingDashboardPage (main page, manages filter state & queries)
├─ PageHeader
│  └─ title: "Milking Dashboard"
│
├─ StatCards (4-column grid)
│  ├─ Total Milk [period]
│  ├─ Avg per Cow
│  ├─ Cows Reporting
│  └─ Groups Active
│
├─ ProductionChart (interactive line/bar chart)
│  └─ Toggle: "By Shift" view
│
├─ FilterBar (collapsible or sticky)
│  ├─ Date Range (from/to pickers)
│  ├─ Group (dropdown, fetched via React Query)
│  ├─ Cow (autocomplete/search)
│  ├─ Shift (radio: All, Morning, Afternoon, Evening)
│  └─ [Apply] or auto-apply on change
│
└─ RecordsTable (paginated)
   ├─ Columns: Date, Cow #, Group, Shift, Milk (qty), Recorded At
   ├─ Sortable headers
   └─ Pagination: offset/limit controls
```

#### State Management

**URL-based state (for bookmarkability):**
```
?startDate=2026-08-01
&endDate=2026-08-31
&groupId=6a7db7417a937cc703bf97a1
&cowId=6a7db7417a937cc703bf979e
&shift=Morning
&sortBy=date
&sortOrder=desc
&page=1
```

**Component state (transient):**
- Chart toggle: "by shift" on/off
- Filter UI open/closed (if collapsible)

#### Data Fetching (React Query)

**Query 1: Summary**
```javascript
useQuery({
  queryKey: ['milking-summary', { startDate, endDate, groupId, cowId, shift }],
  queryFn: () => milkingDataApi.summary({ startDate, endDate, groupId, cowId, shift }),
  staleTime: 30000, // Cache 30s (fresh after import, but not refetch constantly)
})
```

**Query 2: Records (Paginated)**
```javascript
useQuery({
  queryKey: ['milking-records', { startDate, endDate, groupId, cowId, shift, limit, offset }],
  queryFn: () => milkingDataApi.records({ startDate, endDate, groupId, cowId, shift, limit, offset }),
})
```

**Query 3: Filter Options (Groups/Cows)**
```javascript
useQuery({
  queryKey: ['cow-groups', facilityId],
  queryFn: () => cowGroupsApi.list({ facility: facilityId }),
  staleTime: 300000, // Cache 5min (rarely changes during session)
})
```

---

### Data Flow

```
1. Page Load
   → Read URL params (or defaults: today ± 30 days, all groups/cows/shifts)
   → Query summary & records
   → Render StatCards + Chart + Table

2. User changes filter (date/group/cow/shift)
   → Update URL params
   → Re-run summary & records queries
   → Charts/table re-render with new data

3. After import completes (via notifications or polling)
   → Invalidate React Query cache
   → Re-fetch summary & records
   → Display fresh data
```

---

## Key Design Decisions

### 1. On-Demand Aggregation (not batch)
- **Why:** Data must be available immediately after import (user opens dashboard 30s after upload)
- **Trade-off:** Aggregation query takes ~100-200ms per request vs. instant pre-computed lookup
- **Mitigation:** Proper indexing + caching with React Query (staleTime=30s)

### 2. Two-Tier API (Summary + Details)
- **Why:** Aggregating 2,400+ records for the chart is wasteful; use aggregation pipeline instead
- **Trade-off:** Two API calls instead of one
- **Mitigation:** Parallel queries, minimal overhead

### 3. URL-Based Filter State
- **Why:** Users can share/bookmark filtered views; back button restores state
- **Alternative:** localStorage (less shareable)
- **Chosen:** URL params (standard React Router pattern)

### 4. Populate Cow/CowGroup in Response
- **Why:** Table needs to display human-readable names (cow #, group name)
- **Options:**
  a) Return ObjectIds, fetch separately (2+ extra queries)
  b) Populate in aggregation pipeline ($lookup joins)
  c) Serialize with .populate() in controller
- **Chosen:** Option (c) — simplest, already used in BCS endpoints

---

## Testing Strategy

### Backend Tests

**Unit Tests (jest):**
- `milkingDataController.test.js`: Validate request/response shapes, error cases
- Mocking: Mock MongoDB aggregation pipeline responses

**Integration Tests (mongodb-memory-server):**
- Test aggregation pipeline: Different date ranges, group filters, shift filters
- Test pagination: Offset/limit edge cases (limit > total, offset beyond range)
- Test facility scoping: Ensure facility_id filter blocks cross-tenant queries
- Test index performance: Verify $match with indexes completes in <100ms

### Frontend Tests

**Component Tests (React Testing Library):**
- StatCards render correctly with query data
- Chart renders line graph by default, bar graph when "by shift" toggled
- Filter inputs update URL params on change
- RecordsTable columns sort when clicked
- Pagination buttons disable at boundaries

**Integration Tests:**
- Query params → API call → rendered results
- Filter change → URL update → data refresh
- Error state: Null/undefined data renders fallback UI

**E2E (optional, Playwright/Cypress):**
- Full flow: Open dashboard → apply filters → sort table → change page

---

## Performance Targets

| Metric | Target | Method |
|--------|--------|--------|
| Summary API response | <150ms | Aggregation pipeline, indexed $match |
| Records API response | <200ms | Indexed query + pagination |
| Chart render | <500ms | Recharts optimized for 30 data points |
| Filter dropdown open | <300ms | Cached via React Query (5min staleTime) |
| Page initial load | <2s | Parallel queries, skeleton loaders |

---

## Rollout Plan

### Phase 1 (MVP)
- Summary API + Records API
- StatCards + LineChart (daily total only)
- Basic FilterBar (date range only)
- RecordsTable with pagination
- Deploy backend, then frontend

### Phase 2 (Enhancements)
- "By Shift" chart toggle (stacked bar)
- Group/Cow/Shift filters
- Column sorting in table
- Export to CSV

### Phase 3 (Advanced)
- Anomaly detection (flag days with <80% expected production)
- Comparison view (this week vs. last week)
- Predictive alerts (e.g., "Cow 232 production down 20%")

---

## Deployment Notes

- **Backend:** Deploy new endpoints before frontend
- **Database:** Add indexes during/before deployment (may take minutes on large collections)
- **Frontend:** No secrets needed; all calls use facility-scoped auth
- **Monitoring:** Track aggregation pipeline duration, alert if >300ms

---

## Open Questions (Resolved)

- ✅ On-demand or batch aggregation? → On-demand (instant after import)
- ✅ Summary + details or single endpoint? → Two-tier (performance)
- ✅ URL params or local state for filters? → URL params (bookmarkability)

---

## Appendix: MongoDB Aggregation Pipeline (Example)

```javascript
// For summary query: startDate=2026-08-01, endDate=2026-08-31, groupId=optional
db.milking_records.aggregate([
  {
    $match: {
      facility: ObjectId("facility_id"),
      milkSessionAt: {
        $gte: ISODate("2026-08-01T00:00:00Z"),
        $lte: ISODate("2026-08-31T23:59:59Z")
      },
      ...(groupId && { cowGroup: ObjectId(groupId) }),
      ...(cowId && { cow: ObjectId(cowId) }),
      ...(shift && { milkingShift: shift })
    }
  },
  {
    $group: {
      _id: {
        date: { $dateToString: { format: "%Y-%m-%d", date: "$milkSessionAt" } },
        shift: "$milkingShift"
      },
      totalMilk: { $sum: "$milk" },
      recordCount: { $sum: 1 }
    }
  },
  { $sort: { "_id.date": 1 } }
])
```

