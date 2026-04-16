import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.expanduser('~'), 'ml_experiments.db')

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


class MLTracker:
    def __init__(self, experiment_name, description = None):
        self.experiment_name = experiment_name
        self.experiment_id = self._get_or_create_experiment(experiment_name,description)
        self.run_id = None

    def _get_or_create_experiment(self,name,description):
        conn = get_connection()
        try:
            row = conn.execute(
                'SELECT id FROM experiments WHERE name = ?', (name,)
            ).fetchone()

            if row:
                return row['id']


            cursor = conn.execute(
                'INSERT INTO experiments (name, description) VALUES (?,?)',
                (name, description)
            )

            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()


    def start_run(self, run_name=None):
        if run_name is None:
            run_name = f"run-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

        conn = get_connection()
        try:
            cursor = conn.execute(
                'INSERT INTO runs(experiment_id, run_name, status) VALUES(?,?,?)',
                (self.experiment_id,run_name, 'running')
            )

            conn.commit()
            self.run_id = cursor.lastrowid
            print(f"[mltrack] Started run '{run_name}' (id={self.run_id})")
            return self
        finally:
            conn.close()


    
    def log_params(self, params: dict):
        if not self.run_id:
            raise RuntimeError("Call start_run() before logging params")
        
        conn = get_connection()

        try:
            for key, value in params.items():
                conn.execute('INSERT INTO params (run_id, key, value) VALUES(?,?,?)',
                             (self.run_id, key, str(value))
                             )
                
            conn.commit()
        finally:
            conn.close()


    def log_metric(self, key, value, step=0):
        if not self.run_id:
            raise RuntimeError("Call start_run() before logging metrics")

        conn = get_connection()
        try:
            conn.execute(
                'INSERT INTO metrics (run_id, key, value, step) VALUES (?, ?, ?, ?)',
                (self.run_id, key, float(value), int(step))
            )
            conn.commit()
        finally:
            conn.close()


    def end_run(self, status='completed'):
        if not self.run_id:
            raise RuntimeError("No active run to end")

        conn = get_connection()
        try:
            conn.execute(
                '''UPDATE runs 
                   SET status = ?, ended_at = datetime('now')
                   WHERE id = ?''',
                (status, self.run_id)
            )
            conn.commit()
            print(f"[mltrack] Run {self.run_id} ended with status '{status}'")
            self.run_id = None
        finally:
            conn.close()