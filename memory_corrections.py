import sqlite3
import json
import sys
import os
from datetime import datetime, timezone
from uuid import uuid4

DB_PATH = os.environ.get("MEMORY_DB_PATH", os.path.join(os.path.dirname(__file__), "data", "memory_corrections.db"))


def now():
    return datetime.now(timezone.utc).isoformat()


def connect():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("""
        CREATE TABLE IF NOT EXISTS corrections (
            id TEXT PRIMARY KEY,
            memory_key TEXT NOT NULL,
            original_value TEXT NOT NULL,
            proposed_value TEXT NOT NULL,
            evidence TEXT NOT NULL,
            status TEXT NOT NULL CHECK (
                status IN ('pending', 'approved', 'rejected')
            ),
            created_at TEXT NOT NULL,
            decided_at TEXT,
            approved_by TEXT
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY,
            correction_id TEXT NOT NULL,
            action TEXT NOT NULL,
            actor TEXT NOT NULL,
            details TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    db.commit()
    return db


def propose_correction(memory_key, original_value, proposed_value, evidence):
    """Propose a correction; never changes the original memory."""
    if not all([
        str(memory_key).strip(),
        str(original_value).strip(),
        str(proposed_value).strip(),
        str(evidence).strip(),
    ]):
        raise ValueError("All fields must be provided.")

    correction_id = str(uuid4())

    with connect() as db:
        db.execute("""
            INSERT INTO corrections (
                id, memory_key, original_value, proposed_value,
                evidence, status, created_at
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
        """, (
            correction_id, memory_key, original_value,
            proposed_value, evidence, now()
        ))

        db.execute("""
            INSERT INTO audit_log
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            str(uuid4()), correction_id, "proposed",
            "ai", json.dumps({"evidence": evidence}), now()
        ))

    return correction_id


def approve_correction(correction_id, authorized_user):
    """Call only after authenticating the user's approval."""
    if not authorized_user:
        raise PermissionError("An authenticated approver is required.")

    with connect() as db:
        result = db.execute("""
            UPDATE corrections
            SET status = 'approved',
                decided_at = ?,
                approved_by = ?
            WHERE id = ? AND status = 'pending'
        """, (now(), authorized_user, correction_id))

        if result.rowcount != 1:
            raise ValueError(
                "Correction not found or no longer pending."
            )

        db.execute("""
            INSERT INTO audit_log
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            str(uuid4()), correction_id, "approved",
            authorized_user, "Explicit approval recorded.", now()
        ))


def reject_correction(correction_id, authorized_user):
    """Reject a proposal without modifying the original memory."""
    if not authorized_user:
        raise PermissionError("An authenticated approver is required.")

    with connect() as db:
        result = db.execute("""
            UPDATE corrections
            SET status = 'rejected',
                decided_at = ?,
                approved_by = ?
            WHERE id = ? AND status = 'pending'
        """, (now(), authorized_user, correction_id))

        if result.rowcount != 1:
            raise ValueError(
                "Correction not found or no longer pending."
            )

        db.execute("""
            INSERT INTO audit_log
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            str(uuid4()), correction_id, "rejected",
            authorized_user, "Proposal rejected.", now()
        ))


def get_effective_memory(memory_key, original_value):
    """Use an approved override; otherwise preserve the original."""
    with connect() as db:
        rows = db.execute("""
            SELECT original_value, proposed_value
            FROM corrections
            WHERE memory_key = ? AND status = 'approved'
            ORDER BY decided_at DESC
        """, (memory_key,)).fetchall()

    matching = [
        row for row in rows
        if row["original_value"] == original_value
    ]

    if not matching:
        return original_value

    latest_value = matching[0]["proposed_value"]

    if any(
        row["proposed_value"] != latest_value
        for row in matching
    ):
        raise RuntimeError(
            "Conflicting approved corrections; manual review required."
        )

    return latest_value


def get_all_corrections():
    """Retrieve all corrections ordered by creation timestamp."""
    with connect() as db:
        rows = db.execute("""
            SELECT id, memory_key, original_value, proposed_value,
                   evidence, status, created_at, decided_at, approved_by
            FROM corrections
            ORDER BY created_at DESC
        """).fetchall()
        return [dict(row) for row in rows]


def get_audit_log(correction_id=None):
    """Retrieve the audit log entries."""
    with connect() as db:
        if correction_id:
            rows = db.execute("""
                SELECT id, correction_id, action, actor, details, created_at
                FROM audit_log
                WHERE correction_id = ?
                ORDER BY created_at DESC
            """, (correction_id,)).fetchall()
        else:
            rows = db.execute("""
                SELECT id, correction_id, action, actor, details, created_at
                FROM audit_log
                ORDER BY created_at DESC
            """).fetchall()
        return [dict(row) for row in rows]


if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "list":
            print(json.dumps(get_all_corrections(), indent=2))
        elif cmd == "audit":
            c_id = sys.argv[2] if len(sys.argv) > 2 else None
            print(json.dumps(get_audit_log(c_id), indent=2))
        elif cmd == "propose" and len(sys.argv) >= 6:
            c_id = propose_correction(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
            print(json.dumps({"status": "proposed", "correction_id": c_id}))
        elif cmd == "approve" and len(sys.argv) >= 4:
            approve_correction(sys.argv[2], sys.argv[3])
            print(json.dumps({"status": "approved", "correction_id": sys.argv[2]}))
        elif cmd == "reject" and len(sys.argv) >= 4:
            reject_correction(sys.argv[2], sys.argv[3])
            print(json.dumps({"status": "rejected", "correction_id": sys.argv[2]}))
        else:
            print(f"Unknown command: {cmd}")
    else:
        # Default test run
        correction_id = propose_correction(
            memory_key="project_language",
            original_value="JavaScript",
            proposed_value="Python",
            evidence=(
                "Example evidence only: the user explicitly confirmed "
                "that the project uses Python."
            ),
        )
        print("Pending correction:", correction_id)
        print("Original memory remains unchanged.")
