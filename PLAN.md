# Imbaa3D — Unified 2D/3D Floor Plan & Visualization SaaS Platform

## Problem Statement
Build a single SaaS platform that combines: (1) 2D floor plan editing, (2) AI-powered 2D→3D conversion, (3) interactive 3D visualization/virtual tours, and (4) a 3D model portfolio/showcase — all monetized via a credit-based billing system.

## Core Tech Stack
* **Framework:** Next.js 15 (App Router, TypeScript)
* **3D Rendering:** React Three Fiber 9.x + Drei + Three.js
* **2D Canvas:** Konva.js + react-konva (multi-layer, React-native bindings, performant)
* **Styling:** Tailwind CSS 4
* **State Management:** Zustand
* **Database:** PostgreSQL via Prisma ORM
* **Auth:** NextAuth.js (v5 / Auth.js)
* **Payments:** Stripe (credit-based, one-time purchases + optional subscriptions)
* **File Storage:** AWS S3 (or Vercel Blob for MVP)
* **AI/ML Backend:** Python FastAPI microservice (for 2D→3D conversion)
* **Deployment:** Vercel (Next.js) + AWS (AI microservice)
* **Testing:** Vitest + Playwright

## Phase 1: MVP — Foundation, Auth, 3D Viewer, Credit System (Weeks 1–6)

### 1.1 Project Scaffolding
* Next.js 15 with App Router, TypeScript, Tailwind CSS 4, ESLint, Prettier
* Prisma + PostgreSQL schema: `User`, `Project`, `CreditBalance`, `CreditTransaction`, `Payment`
* Folder structure:
```
src/
  app/
    (auth)/login/page.tsx, /register/page.tsx
    (dashboard)/dashboard/page.tsx
    (editor)/editor/[projectId]/page.tsx
    (viewer)/view/[projectId]/page.tsx
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
    prisma.ts     — Prisma client singleton
    auth.ts       — Auth.js config
    s3.ts         — File upload helpers
    store/        — Zustand stores
  types/          — Shared TypeScript types
```

### 1.2 Authentication (NextAuth.js v5)
* Email/password + Google + GitHub OAuth providers
* Prisma adapter for session/user persistence
* Middleware for protected routes
* New users get 5 free credits on registration

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
* `POST /api/webhooks/stripe` — verifies signature, on `checkout.session.completed` atomically increments user credits via Prisma transaction, logs `CreditTransaction` and `Payment`
* Zustand store for real-time credit balance display
* Server-side `useCredits(userId, amount, reason)` function with atomic decrement + balance check in a single Prisma transaction

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

## Database Schema (Core)

```prisma
model User {
  id              String   @id @default(cuid())
  name            String?
  email           String   @unique
  emailVerified   DateTime?
  image           String?
  passwordHash    String?
  credits         Int      @default(5)
  stripeCustomerId String? @unique
  projects        Project[]
  creditTxns      CreditTransaction[]
  payments        Payment[]
  accounts        Account[]
  sessions        Session[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model Project {
  id          String   @id @default(cuid())
  title       String
  description String?
  type        String   @default("FULL_CONVERSION") // 2D_PLAN, 3D_MODEL, FULL_CONVERSION
  status      String   @default("DRAFT") // DRAFT, PROCESSING, COMPLETE, FAILED
  floorPlanData Json?   // 2D editor state
  sceneConfig   Json?   // 3D scene configuration
  thumbnailUrl  String?
  modelUrl      String? // S3 URL for .glb
  isPublic      Boolean @default(false)
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([userId])
}

model CreditTransaction {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  amount    Int      // positive = added, negative = spent
  reason    String   // "purchase", "signup_bonus", "ai_conversion", "hd_render"
  balanceAfter Int
  createdAt DateTime @default(now())
  @@index([userId, createdAt])
}

model Payment {
  id                      String   @id @default(cuid())
  userId                  String
  user                    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  stripeCheckoutSessionId String   @unique
  stripePaymentIntentId   String?  @unique
  amount                  Int      // cents
  currency                String   @default("usd")
  creditsAdded            Int
  status                  String   @default("PENDING") // PENDING, COMPLETED, FAILED
  createdAt               DateTime @default(now())
  @@index([userId])
}
```

## Key Architecture Decisions
1. **R3F loaded client-side only** via `dynamic(() => import(...), { ssr: false })` to avoid SSR hydration issues
2. **Konva editor is also client-only** — same pattern
3. **Credit deduction is atomic** — single Prisma transaction with conditional update (`credits: { gte: amount }`) to prevent race conditions
4. **AI processing is async** — job queue with status polling, never blocks the UI
5. **All 3D assets stored in S3/Blob** — not in the database
6. **Stripe webhooks are the source of truth** for payments — never trust client-side callbacks
