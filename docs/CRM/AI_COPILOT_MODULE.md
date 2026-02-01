# Add-on Module: Field Copilot (AI Knowledge Engine)

## 1. Executive Summary
The **Field Copilot** is an AI-driven diagnostic and knowledge retention engine integrated directly into the FSM mobile workflow. Its purpose is to bridge the "Skills Gap" by providing junior technicians with the real-time diagnostic intelligence of a senior service manager.

Unlike standard "help" files, the Copilot uses **Semantic AI** to understand the meaning behind technical symptoms and suggests solutions based on manufacturer manuals and the company's historical "Golden Tickets."

---

## 2. The Technology: Semantic Search vs. Fuzzy Logic
- **Fuzzy Logic (Old Way):** Relies on keyword matching (e.g., searching for "Capacitor"). If the tech types "Cap," and the manual says "Starter," it finds nothing.
- **Semantic AI (IntelliService Way):** Uses **Vector Embeddings**. It converts words into mathematical concepts. It understands that *"The fan is humming but not spinning"* is conceptually identical to *"Seized condenser fan motor"* or *"Failed start capacitor."*

**Technique:** We use **RAG (Retrieval-Augmented Generation)**. We do not let the AI "invent" answers; we use the AI to **find** the exact paragraph in a manual or a specific past repair note that solves the current problem.

---

## 3. System Architecture Requirements

### A. Infrastructure (The "Brain")
- **Database:** Enable `pgvector` extension in the existing Supabase instance.
- **Embedding Model:** Integration with an LLM provider (OpenAI `text-embedding-3-small` or similar) via Supabase Edge Functions.
- **Storage:** Use existing Supabase Storage buckets for PDFs (Manuals) and MP4s (Tech Tip Videos).

### B. New Schema Additions
- `knowledge_base_vectors`: Stores the mathematical "fingerprints" (embeddings) of technical text.
- `knowledge_sources`: Tracks where the info came from (e.g., "Carrier Infinity Service Manual", "Senior Tech Mike's Notes").
- `feedback_loop`: Tracks "helpful" vs. "not helpful" ratings from technicians to rank results.

---

## 4. Operational Workflows

### Workflow 1: Knowledge Ingestion (Feeding the Brain)
1. **Manual Ingestion:** Admin uploads a PDF manual. An Edge Function "chunks" the PDF into logical paragraphs, generates vectors for each, and stores them.
2. **Golden Ticket Harvesting:** When a ticket is marked "Completed" with a 5-star rating, the system automatically sanitizes the `resolution_notes` and adds them to the knowledge base.

### Workflow 2: Real-time Triage (The Tech Experience)
1. **Context Trigger:** The tech opens a ticket for a `Carrier 58TN` with the problem `NO-HEAT`.
2. **Auto-Search:** The Copilot pre-fetches the Top 3 most relevant tips for that specific model/problem combination.
3. **Query:** The tech can type a natural language question: *"Flame sensor is cleaned but still locking out, what next?"*
4. **Response:** Copilot returns: *"Check ground wire continuity (Manual Page 42) or verify gas valve manifold pressure (Successful repair on Ticket #882)."*

---

## 5. Integration with FSM-CRM Build
The Copilot is not a standalone app; it is a **Layer** over the existing build:
- **FSM Integration:** Appears as a "Diagnostic Assistant" tab inside the Active Ticket view.
- **CRM Integration:** If the Copilot suggests a repair that costs >50% of a new unit, it triggers the **"Sales Hunter" pipeline** to create a replacement lead.
- **Analytics Integration:** Tracks "Technical Knowledge Gaps." If techs are constantly asking the Copilot about "ECM Motors," the Service Manager knows to schedule a training class on that specific topic.

---

## 6. Implementation "To Do" List
1. [ ] **Infrastructure:** Enable `pgvector` on a test Supabase branch.
2. [ ] **AI Connection:** Set up a Supabase Edge Function to communicate with the Embedding API.
3. [ ] **PDF Parser:** Build a script to "read and vectorize" a sample HVAC service manual.
4. [ ] **UI Component:** Design a "Copilot Drawer" for the mobile React interface that displays "Suggested Solutions."
5. [ ] **Feedback Loop:** Implement the "Helpful/Not Helpful" buttons to refine the AI over time.
