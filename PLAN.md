# Imbaa3D — Unified 2D/3D Floor Plan & Visualization SaaS Platform

## Problem Statement
Build a single SaaS platform that combines: (1) 2D floor plan editing, (2) AI-powered 2D→3D conversion, (3) interactive 3D visualization/virtual tours, and (4) a 3D model portfolio/showcase — all monetized via a credit-based billing system.

## Core Tech Stack
* **Framework:** Next.js 16 (App Router, TypeScript)
* **3D Rendering:** React Three Fiber 9.x + Drei + Three.js
* **2D Canvas:** Konva.js + react-konva (multi-layer, React-native bindings, performant)
* **Styling:** Tailwind CSS 4
* **State Management:** Zustand
* **Database:** PostgreSQL via **Drizzle ORM** (`drizzle-orm` + `postgres`)
* **Auth:** **Clerk** (`@clerk/nextjs`) — managed auth with Clerk middleware in `src/proxy.ts`
* **Payments:** Stripe (credit-based, one-time purchases + optional subscriptions)
* **File Storage:** AWS S3 (or Vercel Blob for MVP)
* **AI/ML Backend:** Python FastAPI microservice (for 2D→3D conversion)
* **Deployment:** Vercel (Next.js) + AWS (AI microservice)
* **Testing:** Vitest + Playwright

## Phase 1: MVP — Foundation, Auth, 3D Viewer, Credit System (Weeks 1–6)

### Phase 1 Status (Repo Reality)
Completed in this repo:
* Next.js 16 App Router + Tailwind + TypeScript baseline
* Clerk auth wired (`<ClerkProvider>` in root layout + `src/proxy.ts` route protection)
* Clerk UI routes: `/sign-in` and `/sign-up` (with legacy `/login` + `/register` redirecting)
* Drizzle ORM schema for `User`, `Project`, `CreditTransaction`, `Payment`
* Project CRUD API routes and protected dashboard/editor routes
* Stripe checkout + Stripe webhook handling for credit purchases
* Local dev DB diagnostics endpoint (dev-only): `GET /api/debug/db`

Still required to fully finish Phase 1:
* Reliable local Postgres bootstrap + migrations as a documented workflow for Fedora/Podman (see "Local DB Setup" below)
* Ensure Stripe webhook runs against a migrated DB in all environments
* 3D viewer route `/view/[projectId]` (plan mentions it; not currently implemented as a dedicated route)

### 1.1 Project Scaffolding
* Next.js 16 (App Router, TypeScript, Tailwind CSS 4, ESLint)
* Drizzle ORM + PostgreSQL schema: `User`, `Project`, `CreditTransaction`, `Payment`
* Folder structure:
```
src/
  app/
    login/page.tsx, register/page.tsx   # legacy redirects
    sign-in/[[...sign-in]]/page.tsx     # Clerk UI
    sign-up/[[...sign-up]]/page.tsx     # Clerk UI
    (dashboard)/dashboard/page.tsx
    (editor)/editor/[projectId]/page.tsx
    api/
      webhooks/stripe/route.ts
      projects/route.ts
      credits/checkout/route.ts
  components/
    three/        — R3F components (Scene, Viewer, Controls)
    canvas/       — Konva 2D editor components
    ui/           — Shared UI (buttons, modals, cards)
    layout/       — Nav, Sidebar, Footer
  lib/
    stripe.ts     — Stripe server singleton
    db/
      index.ts    — Drizzle client singleton
      schema.ts   — Drizzle table definitions
    s3.ts         — File upload helpers
    store/        — Zustand stores
  proxy.ts        — Clerk middleware (Next.js 16+)
  types/          — Shared TypeScript types
```

### 1.2 Authentication (Clerk)
* Managed sign-up/sign-in via Clerk (email/password, Google, GitHub out of the box)
* `<ClerkProvider>` wraps the root layout
* Route protection via `clerkMiddleware()` + `createRouteMatcher()` in `src/proxy.ts` (Next.js 16 convention)
* New users get 5 free credits via DB default when their `User` row is created on first authenticated request (`ensureDbUser()`)

### 1.3 Credit-Based SaaS Billing (Stripe)
**Credit Packages (Stripe Products, one-time payment mode):**
* Starter: 10 credits — $4.99
* Pro: 50 credits — $19.99 (20% savings)
* Business: 200 credits — $59.99 (40% savings)

**Credit costs per action:**
* AI 2D→3D conversion: 3 credits
* HD render export: 1 credit
* AI furniture suggestion: 1 credit

**Implementation:**
* `POST /api/credits/checkout` — creates Stripe Checkout Session with `mode: 'payment'`, stores `userId` + `creditsToAdd` in metadata
* `POST /api/webhooks/stripe` — verifies signature, on `checkout.session.completed` atomically increments user credits via Drizzle transaction, logs `CreditTransaction` and `Payment`
* Zustand store for real-time credit balance display
* Server-side `useCredits(userId, amount, reason)` function with atomic decrement + balance check in a single Drizzle transaction

### Local DB Setup (Fedora Notes)
The repo expects Postgres credentials via `DATABASE_URL`.

Important:
* Fedora often has a system Postgres already running on `localhost:5432` with `ident` auth, which will reject password connections (e.g. `code=28000`).
* To avoid touching system Postgres configuration, use a dev container on port `5433`.

Recommended (Podman) dev DB:
```bash
podman run -d --name imbaa3d-db \
  -e POSTGRES_DB=imbaa3d \
  -e POSTGRES_USER=imbaa3d \
  -e POSTGRES_PASSWORD=imbaa3d \
  -p 5433:5432 \
  -v imbaa3d_pgdata:/var/lib/postgresql/data \
  docker.io/library/postgres:16
```

Then set:
* `DATABASE_URL="postgresql://imbaa3d:imbaa3d@localhost:5433/imbaa3d"`

And create tables from Drizzle schema:
```bash
npm run db:push
```

### 1.4 Project Management
* CRUD for projects (title, description, type: `2D_PLAN` | `3D_MODEL` | `FULL_CONVERSION`)
* Dashboard page listing user projects with thumbnails, status, last modified
* Project data stored as JSON (floor plan geometry, 3D scene config)

### 1.5 Basic 3D Viewer
* R3F Canvas loaded via `dynamic(() => import(...), { ssr: false })`
* OrbitControls, Environment map (drei), ambient + directional lighting
* Load and display `.glb/.gltf` models via `useGLTF`
* Suspense + loading fallback
* Responsive canvas

### 1.6 Landing Page & Marketing
* Hero with embedded 3D scene
* Feature overview, pricing cards, CTA
* SEO meta, Open Graph tags

## Phase 2: 2D Floor Plan Editor (Weeks 7–12)

### Phase 2 Status (Repo Reality)
In progress:
* Basic Konva-based 2D editor lives inside `/editor/[projectId]` and persists to `Project.floorPlanData`
* True multi-layer editor implemented (grid, walls, openings, furniture, annotations, UI overlay)
* Tools implemented: select, pan, zoom, wall draw (endpoint snap + Shift constrain), door/window placement (snap-to-wall)
* Room tool: draw room polygons and show auto-calculated area labels (m^2/ft^2), with draggable vertices
* Properties: rooms list (name + area) for quick selection
* Room drafting: on-canvas hints + live area readout while placing points
* Room drafting snapping: room points can snap to wall endpoints (and Shift-constrain) for clean outlines
* Room drafting close assist: hover magnet + "Click to close" highlight when near the first point
* Selection + transform for furniture and openings, delete, undo/redo, autosave + manual save
* Asset library sidebar (categorized list + search: Living/Bedroom/Dining/Kitchen/Bathroom/Office) + SVG icons (incl. bookshelf/wardrobe/fridge) + drag-and-drop onto canvas + mobile assets picker
* Properties panel (grid, units/scale, wall thickness, item/opening sizing + rotation, delete)
* Autosave: edits from both canvas interactions and Properties panel mark the doc dirty and autosave correctly
* Wall editing: draggable endpoint handles; doors/windows remain attached to walls while editing
* Wall translate: drag selected wall to move it (grid-snapped), openings remain attached
* Productivity shortcuts: Ctrl/Cmd+C, Ctrl/Cmd+V, Ctrl/Cmd+D for walls/items/openings/rooms (paste at cursor or viewport center)
* Tool hotkeys: `1` select, `2` wall, `3` room, `4` door, `5` window, `6` furniture
* Scale calibration: select a wall, enter real length, auto-compute `pxPerMeter` so dimension labels match
* Placement snapping: new furniture placement (click/drag-drop/paste) also snaps to nearby walls
* Drag-and-drop UX: custom drag preview for assets + clearer drop highlight on canvas
* Serialization tooling: import/export FloorPlan JSON for easier testing and migrations
* Serialization hardening: v2 normalization/sanitization so malformed docs can't break the editor
* Snapping + fine positioning: grid/wall snap toggles, plus arrow-key nudge (Shift=10x, Alt/Option=0.5x)
* Rotate shortcut: press `R` to rotate selected items (and detached openings) by 90 degrees (Shift = -90 degrees)
* Measurement tool: Measure mode (or press `M`) click two points to see distance in m/ft
* Wall editing: set wall length directly from Properties panel
* Snap hotkeys: press `G` to toggle grid snap, `W` to toggle wall snap
* Snapping persistence: snap settings are stored in `floorPlanData` so they survive reload/import
* Snapping undo/redo: snap toggles are tracked in history so Undo/Redo restores snapping state
* Export PNG and wall dimension labels in real units (m/ft) via `pxPerMeter` scale
* Basic on-canvas visual overlays for furniture/openings (type-specific colors + abbreviations + centered SVG icons, including door/window icons)
* View navigation improved: hold Space to pan, plus "Reset view" (Ctrl/Cmd+0), plus Undo/Redo buttons in the editor toolbar
* Wall edit hardening: attached doors/windows clamp within wall segment and auto-shrink if wall becomes too short

Pending for Phase 2 completion:
* Richer asset library (more SVG/PNG icons + drag previews + drag-to-rotate), plus on-canvas icon rendering if desired
* Robust serialization schema + migrations/versioning for floor plan docs (beyond doc v2 upgrades)
* Dimension system hardening (units, snapping, nicer label placement) and more editing affordances

### 2.1 Canvas Editor (Konva.js + react-konva)
* Multi-layer architecture: grid layer, walls layer, furniture layer, annotation layer, UI overlay layer
* Drawing tools: straight walls (click-to-place), doors, windows
* Object library sidebar: drag-and-drop furniture (bed, sofa, table, toilet, sink, etc.) from SVG/PNG assets
* Selection, move, rotate, resize with Transformer
* Snap-to-grid and snap-to-wall via `dragBoundFunc`
* Automatic dimension labels on walls
* Undo/redo via command pattern (Zustand middleware)
* Zoom/pan controls
* Keyboard shortcuts (Delete, Ctrl+Z, Ctrl+Y, Ctrl+S)

### 2.2 Project Serialization
* Save canvas state as JSON (walls array, furniture placements, dimensions)
* Auto-save with debounce
* Manual save to DB via API route
* Export 2D plan as PNG (Konva `stage.toDataURL()`)

### 2.3 Expanded Asset Library
* Categorized furniture: Living Room, Bedroom, Kitchen, Bathroom, Office
* Search/filter
* Custom dimension input for walls and rooms
* Room area auto-calculation

## Phase 3: AI-Powered 2D→3D Conversion (Weeks 13–20)

### 3.1 AI Microservice (Python FastAPI)
* Endpoint: `POST /api/convert` — accepts 2D floor plan JSON or image
* Wall detection from uploaded images (OpenCV + custom model)
* Room segmentation and labeling
* Door/window detection
* Output: structured JSON with 3D geometry data (wall positions, heights, openings)
* Containerized with Docker, deployed on AWS ECS/Lambda

### 3.2 3D Generation Pipeline
* Server-side: convert AI output JSON → Three.js-compatible geometry
* Generate wall meshes, floor planes, ceiling, door/window cutouts
* Apply default PBR materials (walls=white, floor=wood, etc.)
* Export as `.glb` file, store in S3
* Credit deduction: 3 credits per conversion (checked before processing)

### 3.3 Enhanced 3D Viewer
* Load generated `.glb` from S3
* Material switching UI (wall colors, floor textures from preset library)
* Camera presets (top, front, perspective)
* First-person walkthrough mode (PointerLockControls)
* Measurement tool (click two points → distance)
* Post-processing: SSAO, anti-aliasing via `@react-three/postprocessing`

### 3.4 2D Plan Upload & Conversion
* Upload 2D plan image (JPG/PNG/PDF)
* Processing status UI (queued → processing → complete → failed)
* Redis/SQS job queue for async processing
* Webhook or polling for completion notification

## Phase 4: Professional Features & Collaboration (Weeks 21–30)

### 4.1 Virtual Staging & Furniture
* 3D furniture library (`.glb` models)
* Drag-and-drop furniture into 3D scenes
* Snap to floor, collision detection
* Material/color customization per object

### 4.2 Sharing & Embedding
* Public shareable links for 3D views (`/view/[projectId]?token=...`)
* Embeddable `<iframe>` viewer with customizable controls
* Social sharing with OG image previews (server-rendered thumbnails)

### 4.3 Team Collaboration
* Invite users to projects (viewer/editor roles)
* Comments on specific areas (3D annotations)
* Project version history

### 4.4 Advanced Export
* High-res PNG/JPEG renders (server-side via headless Three.js)
* PDF floor plans with dimensions and scale
* `.glb` / `.gltf` download
* `.obj` / `.fbx` export

### 4.5 Subscription Tiers (Optional, alongside credits)
* Free: 5 credits, 2 projects, basic exports
* Pro ($19/mo): 30 credits/mo, unlimited projects, HD exports, collaboration
* Business ($49/mo): 100 credits/mo, team features, API access, white-label

## Phase 5: Advanced AI & Ecosystem (Weeks 31+)

### 5.1 AI Enhancements
* Smart furniture layout suggestions based on room type/size
* AI material/style recommendations from text prompts
* Image-to-floor-plan: upload photo → digitized 2D plan
* Auto-optimization of uploaded 3D models (polygon reduction, LOD)

### 5.2 AR/VR
* WebXR "View in AR" for mobile (place model in real space)
* VR walkthrough support via `@react-three/xr`

### 5.3 Marketplace
* User-uploaded 3D assets for sale
* Revenue share model
* Asset ratings and reviews

### 5.4 Public API
* REST API for programmatic 2D→3D conversion
* Credit-based API authentication
* Rate limiting, usage dashboard

## Database Schema (Core — Drizzle ORM)

> Schema defined in `src/lib/db/schema.ts`. Session/account management is handled by Clerk; only application data lives in Postgres.

```ts
// Users — keyed by Clerk user ID
export const users = pgTable("User", {
  id: text("id").primaryKey(),           // Clerk user ID (e.g. user_xxx)
  name: text("name"),
  email: text("email").notNull().unique(),
  image: text("image"),
  credits: integer("credits").notNull().default(5),
  stripeCustomerId: text("stripeCustomerId").unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const projects = pgTable("Project", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("FULL_CONVERSION"),
  status: text("status").notNull().default("DRAFT"),
  floorPlanData: jsonb("floorPlanData"),
  sceneConfig: jsonb("sceneConfig"),
  thumbnailUrl: text("thumbnailUrl"),
  modelUrl: text("modelUrl"),
  isPublic: boolean("isPublic").notNull().default(false),
  userId: text("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const creditTransactions = pgTable("CreditTransaction", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  balanceAfter: integer("balanceAfter").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const payments = pgTable("Payment", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  stripeCheckoutSessionId: text("stripeCheckoutSessionId").notNull().unique(),
  stripePaymentIntentId: text("stripePaymentIntentId").unique(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("usd"),
  creditsAdded: integer("creditsAdded").notNull(),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
```

## Key Architecture Decisions
1. **R3F loaded client-side only** via `dynamic(() => import(...), { ssr: false })` to avoid SSR hydration issues
2. **Konva editor is also client-only** — same pattern
3. **Credit deduction is atomic** — single Drizzle transaction with conditional update (SELECT + UPDATE with row-level check) to prevent race conditions
4. **AI processing is async** — job queue with status polling, never blocks the UI
5. **All 3D assets stored in S3/Blob** — not in the database
6. **Stripe webhooks are the source of truth** for payments — never trust client-side callbacks
7. **Auth handled entirely by Clerk** — no session tables in DB; user identity is the Clerk user ID; a local `User` row is ensured on first authenticated request (`ensureDbUser()`), and on webhook flows when needed (`ensureDbUserById()`)
8. **Middleware lives in `src/proxy.ts`** — Next.js 16 convention (was `middleware.ts` in v15)
