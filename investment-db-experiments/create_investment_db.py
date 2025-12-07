#!/usr/bin/env python3
"""
Investment Portfolio Tracker - Database Setup
=============================================
Creates the SQLite database schema for tracking private market investments
across multiple entities (personal, trusts, LLCs).

Usage:
    python create_investment_db.py

This will create 'investments.db' in the current directory.
"""

import sqlite3
from datetime import datetime
from pathlib import Path

DB_NAME = "investments.db"

SCHEMA = """
-- Entities: The legal structures that hold investments
-- e.g., "Sean" (personal), "KDK Charitable Trust", "DAS LLC"
CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('personal', 'trust', 'llc')),
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Investments: Individual funds or direct investments
-- Each investment is owned by one entity
CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    investment_type TEXT NOT NULL CHECK (investment_type IN ('fund', 'direct')),
    platform TEXT,  -- e.g., 'carta', 'angelist', 'assure', or NULL
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'exited', 'written_off')),
    committed_amount REAL,  -- Total committed (for funds)
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES entities(id)
);

-- Documents: Source materials (emails, PDFs, manual entries)
-- This is your "staging" table - everything flows through here
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL CHECK (source_type IN ('email', 'pdf', 'manual')),
    source_path TEXT,  -- File path or email message ID
    source_date TEXT,  -- When the document was sent/created
    classification TEXT CHECK (classification IN (
        'capital_call',
        'distribution', 
        'k1',
        'quarterly_update',
        'tax_document',
        'legal',
        'other',
        'unparseable'
    )),
    entity_id INTEGER,  -- Which entity this relates to (if known)
    investment_id INTEGER,  -- Which investment this relates to (if known)
    raw_text TEXT,  -- Original content for reference
    parsed_data TEXT,  -- JSON blob of extracted structured data
    needs_review INTEGER DEFAULT 1,  -- 1 = needs human review, 0 = processed
    processed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES entities(id),
    FOREIGN KEY (investment_id) REFERENCES investments(id)
);

-- Transactions: The actual money movements
-- Extracted from documents or entered manually
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investment_id INTEGER NOT NULL,
    document_id INTEGER,  -- Source document (nullable for manual entries)
    transaction_date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN (
        'capital_call',
        'distribution',
        'valuation',
        'fee',
        'other'
    )),
    amount REAL NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (investment_id) REFERENCES investments(id),
    FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- Useful indexes for common queries
CREATE INDEX IF NOT EXISTS idx_investments_entity ON investments(entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_classification ON documents(classification);
CREATE INDEX IF NOT EXISTS idx_documents_needs_review ON documents(needs_review);
CREATE INDEX IF NOT EXISTS idx_transactions_investment ON transactions(investment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
"""

# Pre-populate with your entities
SEED_ENTITIES = [
    ("Sean", "personal", "Personal investments"),
    ("DAS LLC", "llc", "Direct and fund investments"),
    ("KDK Charitable Trust", "trust", "Fund investments only"),
]


def create_database():
    """Create the database and schema."""
    db_path = Path(DB_NAME)
    
    if db_path.exists():
        print(f"⚠️  Database '{DB_NAME}' already exists.")
        response = input("   Overwrite? (y/N): ").strip().lower()
        if response != 'y':
            print("   Aborted.")
            return
        db_path.unlink()
    
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    # Create schema
    cursor.executescript(SCHEMA)
    print(f"✓ Created database schema")
    
    # Seed entities
    cursor.executemany(
        "INSERT INTO entities (name, type, notes) VALUES (?, ?, ?)",
        SEED_ENTITIES
    )
    print(f"✓ Added {len(SEED_ENTITIES)} entities")
    
    conn.commit()
    conn.close()
    
    print(f"\n✅ Database created: {db_path.absolute()}")
    print(f"\nNext steps:")
    print(f"  1. Install DB Browser for SQLite to explore: https://sqlitebrowser.org/")
    print(f"  2. Or query from terminal: sqlite3 {DB_NAME}")
    print(f"  3. Example query: SELECT * FROM entities;")


if __name__ == "__main__":
    create_database()
