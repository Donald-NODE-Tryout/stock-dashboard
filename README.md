# 📦 Enterprise Stock & Logistics ERP Dashboard

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green?style=flat-square&logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-3.7_Flash-orange?style=flat-square&logo=google)](https://deepmind.google/technologies/gemini/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com/)

A production-grade **Enterprise Inventory Management, Dispatch Logistics, and Stock Ledger ERP** built for multi-location businesses. Includes an **AI-driven conversational WhatsApp assistant** that answers stock inquiries, checks real-time availability, and records transactions on the go.

---

## 🌟 Key Highlights

### 1. 📊 Real-Time Multi-Location Inventory Dashboard
- **Instant Stock Aggregation**: High-performance SQL views calculate net stock dynamically across warehouses, shops, and secondary facilities without manual tallying.
- **Smart Matrix & Filters**: Categorized models, company filtering, custom drag-and-drop row arrangements, and stock health indicators (low stock, out of stock, healthy).

### 2. 📑 Double-Entry Style Stock Movement Ledger
- **Transaction Types**: Supports `PURCHASE` (inward), `SALE` (outward), `TRANSFER` (inter-facility), and `ADJUSTMENT` (stock reconciliations).
- **Atomic Sequential Numbering**: PostgreSQL sequence-based `entry_id` (`VI/ENT/1001`) with collision fallback.
- **Smart Location Swapping**: Collision prevention automatically detects and swaps duplicate facilities during transfers.

### 3. 🚚 Multi-Facility Dispatch Ticketing Flow
- **End-to-End Status Pipeline**: `DRAFT` $\rightarrow$ `SUBMITTED` $\rightarrow$ `APPROVED` $\rightarrow$ `IN_TRANSIT` $\rightarrow$ `FULFILLED` / `CANCELLED`.
- **Validation Guardrails**: Validates dispatch quantities against actual source facility stock levels in real time before ticket submission.

### 4. 🛡️ Immutable Audit Archive & Database Triggers
- Automatic PostgreSQL triggers capture any deleted record across Stock Movements, Dispatch Tickets, and Staff Register into `deleted_records_archive`.
- Preserves full JSON snapshots, timestamps, and attributing users with single-click restore capabilities.

### 5. 🤖 Autonomous WhatsApp AI Assistant (Gemini 3.7 Flash)
- **Natural Language Inquiries**: Staff can text *"How many GN-3500 do we have in Mota Mova?"* and receive real-time stock breakdowns within seconds.
- **Role-Based WhatsApp Verification**: Validates incoming phone numbers against active staff in `employee_register` before disclosing inventory data.
- **Zero-Cold-Boot Keep-Alive**: Configured with automated PostgreSQL cron health checks keeping the Baileys gateway warm 24/7.
- **Atomic Deduplication**: PostgreSQL primary-key locking prevents burst or duplicate replies across concurrent webhook flushes.

---

## 🏗️ Architecture

```
                   +----------------------------------+
                   |           User Browser           |
                   |      (Next.js 15 / React 19)     |
                   +-----------------+----------------+
                                     |
                                     v
                   +----------------------------------+
                   |        Vercel Edge Network       |
                   |   (SSR, Server Actions, REST)    |
                   +-----------------+----------------+
                                     |
              +----------------------+----------------------+
              |                                             |
              v                                             v
+-----------------------------+               +-----------------------------+
|    Supabase (PostgreSQL)    |               |  Evolution API (Render/WS)  |
|  - Real-Time Stock Views    |               |  - WhatsApp Baileys Engine  |
|  - Audit Triggers & Archive |               +--------------+--------------+
|  - Row Level Security (RLS) |                              |
|  - pg_cron & pg_net         | <------- Webhook ------------+
+--------------+--------------+
               |
               v
+-----------------------------+
|  Supabase Edge Functions    |
|  - WhatsApp Webhook Parser  |
|  - Google Gemini AI Engine  |
|  - Atomic Deduplication     |
+-----------------------------+
```

---

## 🚀 Quick Start & Setup Guide

### 1. Prerequisites
- **Node.js**: v18.17.0 or later (v20+ recommended)
- **Git**: Installed locally
- **Supabase Account**: Free project on [supabase.com](https://supabase.com)
- **Vercel Account**: Free account on [vercel.com](https://vercel.com)

---

### 2. Clone and Install Dependencies

```bash
git clone https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
cd <YOUR_REPO_NAME>
npm install
```

---

### 3. Environment Variables Configuration

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your credentials in `.env.local`:

```env
# Next.js Public Keys
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Supabase Server-Side Key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

---

### 4. Database Setup & Migrations

Execute the SQL migration scripts located in `supabase/migrations/` inside your **Supabase SQL Editor**:

1. `supabase/migrations/20260826_employee_auth_system.sql` — Staff register & role-based authentication.
2. `supabase/migrations/20260906_dispatch_tickets_status_flow.sql` — Dispatch tickets schema and state transitions.
3. `supabase/migrations/20260925_audit_archive_system.sql` — Immutable archive table & automatic deletion triggers.

---

### 5. Running the Application Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚢 Deploying to Vercel (100% Free Tier)

1. Push your code to your GitHub repository:
   ```bash
   git add .
   git commit -m "Configure deployment"
   git push -u origin main
   ```
2. Navigate to [vercel.com/new](https://vercel.com/new).
3. Import your GitHub repository.
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Click **Deploy**. Vercel will build and host your application with automatic SSL and zero-downtime updates on every subsequent `git push`.

---

## 🤖 WhatsApp Bot Setup (Optional)

1. **Deploy Evolution API**: Deploy the open-source [Evolution API](https://github.com/EvolutionAPI/evolution-api) container on Render or any Docker host.
2. **Deploy Supabase Edge Function**:
   ```bash
   npx supabase functions deploy whatsapp-webhook --project-ref <YOUR_PROJECT_REF>
   ```
3. **Configure Edge Function Secrets**:
   Set `SUPA_URL`, `SUPA_SERVICE_KEY`, `GEMINI_API_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, and `EVOLUTION_INSTANCE` in your Supabase Dashboard under **Edge Functions** $\rightarrow$ **Secrets**.
4. Set the Evolution API instance webhook target to:
   `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook`

---

## 🛠️ Tech Stack Summary

| Layer | Technology |
|---|---|
| **Frontend Framework** | [Next.js 15](https://nextjs.org/) (App Router, Turbopack) |
| **UI Library** | [React 19](https://react.dev/), [Lucide React](https://lucide.dev/) |
| **Styling** | [Tailwind CSS 3.4](https://tailwindcss.com/) |
| **Database** | [Supabase PostgreSQL](https://supabase.com/) |
| **AI / LLM** | [Google Gemini 3.7 Flash](https://ai.google.dev/) via `@google/generative-ai` |
| **WhatsApp Gateway** | [Evolution API](https://github.com/EvolutionAPI/evolution-api) (Baileys engine) |
| **Edge Compute** | Supabase Edge Functions (Deno Runtime) |
| **Hosting & CI/CD** | [Vercel](https://vercel.com/) (Hobby Plan) |

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
