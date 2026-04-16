import Database from "better-sqlite3";
import path from 'path';
import os from 'os';


const DB_PATH = path.join(os.homedir(),'ml_experiments.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

try {
  db.exec(`ALTER TABLE runs ADD COLUMN notes TEXT`);
} catch (e) {
}

db.exec(`
  CREATE TABLE IF NOT EXISTS patterns (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id INTEGER,
    pattern_type  TEXT NOT NULL,
    observation   TEXT NOT NULL,
    confidence    TEXT DEFAULT 'medium',
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (experiment_id) REFERENCES experiments(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS experiments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id INTEGER NOT NULL,
    run_name      TEXT,
    status        TEXT DEFAULT 'running',  -- running | completed | failed
    started_at    TEXT DEFAULT (datetime('now')),
    ended_at      TEXT,
    FOREIGN KEY (experiment_id) REFERENCES experiments(id)
  );

  CREATE TABLE IF NOT EXISTS params (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    key    TEXT NOT NULL,
    value  TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs(id)
  );

  CREATE TABLE IF NOT EXISTS metrics (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id    INTEGER NOT NULL,
    key       TEXT NOT NULL,
    value     REAL NOT NULL,
    step      INTEGER DEFAULT 0,
    logged_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (run_id) REFERENCES runs(id)
  );
    
`);


export function listExperiments() {
    return db.prepare(`
        SELECT e.*, COUNT(r.id) as run_count
        FROM experiments e
        LEFT JOIN runs r
        ON e.id = r.experiment_id
        GROUP BY e.id
        ORDER BY e.created_at DESC 
        `).all();
}


export function getRunsForExperiment(experimentID) {
    return db.prepare(`
        SELECT * FROM runs
        WHERE experiment_id = ?
        ORDER BY started_at DESC
        `).all(experimentID);
}

export function getRunDetails(runId) {
    const run = db.prepare(`SELECT * FROM runs WHERE id = ? `).get(runId);
    if (!run) return null;

    const params = db.prepare(`SELECT key, value FROM params WHERE run_id = ?`).all(runId);
    const metrics = db.prepare(`
      SELECT key, value, step FROM metrics
      where run_id = ?
      ORDER BY step ASC
      `).all(runId);


    const metricsByKey = {};
    for (const m of metrics) {
      if (!metricsByKey[m.key]) metricsByKey[m.key] = []
      metricsByKey[m.key].push({step: m.step, value: m.value});
    }

    const finalMetrics = {};
    for (const [key, values] of Object.entries(metricsByKey)) {
      finalMetrics[key] = values[values.length - 1].value;
    }

    return {...run, params, finalMetrics, metricHistory: metricsByKey};
  }


export function getBestRun(experimentId, metricKey, higher_is_better = true) {
  const order = higher_is_better ? 'DESC' : 'ASC';
  return db.prepare(`
    SELECT r.*, m.value as best_metric_value
    FROM runs r
    JOIN metrics m ON m.run_id = r.id
    WHERE r.experiment_id = ?
      AND m.key = ?
      AND r.status = 'completed'
    ORDER BY m.value ${order}
    LIMIT 1
  `).get(experimentId, metricKey);
}


export function getMetricHistory(experimentId, metricKey) {
  return db.prepare(`
    SELECT r.run_name, r.id as run_id, m.value, m.step
    FROM metrics m
    JOIN runs r ON r.id = m.run_id
    WHERE r.experiment_id = ?
      AND m.key = ?
    ORDER BY r.started_at ASC, m.step ASC
  `).all(experimentId, metricKey);
}

export function compareRuns(runIdA, runIdB) {

  const runA = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runIdA);
  const runB = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runIdB);

  if (!runA || !runB) return null;


  const paramsA = db.prepare(`SELECT key, value FROM params WHERE run_id = ?`).all(runIdA);
  const paramsB = db.prepare(`SELECT key, value FROM params WHERE run_id = ?`).all(runIdB);

  
  
  const paramsObjA = Object.fromEntries(paramsA.map(p => [p.key, p.value]));
  const paramsObjB = Object.fromEntries(paramsB.map(p => [p.key, p.value]));

  
  const paramDiff = {};
  const allKeys = new Set([...Object.keys(paramsObjA), ...Object.keys(paramsObjB)]);
  
  for (const key of allKeys) {
    const valA = paramsObjA[key] ?? 'not set';
    const valB = paramsObjB[key] ?? 'not set';
    if (valA !== valB) {
      paramDiff[key] = { runA: valA, runB: valB };
    }
  }


  const finalMetricsA = db.prepare(`
    SELECT key, value FROM metrics
    WHERE run_id = ?
    GROUP BY key
    HAVING step = MAX(step)
  `).all(runIdA);

  const finalMetricsB = db.prepare(`
    SELECT key, value FROM metrics
    WHERE run_id = ?
    GROUP BY key
    HAVING step = MAX(step)
  `).all(runIdB);

  const metricsObjA = Object.fromEntries(finalMetricsA.map(m => [m.key, m.value]));
  const metricsObjB = Object.fromEntries(finalMetricsB.map(m => [m.key, m.value]));


  const metricDiff = {};
  const allMetricKeys = new Set([...Object.keys(metricsObjA), ...Object.keys(metricsObjB)]);

  for (const key of allMetricKeys) {
    const valA = metricsObjA[key] ?? null;
    const valB = metricsObjB[key] ?? null;
    const delta = (valA !== null && valB !== null) ? valB - valA : null;
    metricDiff[key] = {
      runA: valA,
      runB: valB,
      delta: delta !== null ? parseFloat(delta.toFixed(4)) : null,
      improved: delta !== null ? delta > 0 : null
    };
  }

  return {
    runA: { id: runA.id, name: runA.run_name, status: runA.status },
    runB: { id: runB.id, name: runB.run_name, status: runB.status },
    paramChanges: paramDiff,
    metricComparison: metricDiff
  };
}


export function addNoteToRun(runId, note) {
  const run = db.prepare(`SELECT id FROM runs WHERE id = ?`).get(runId);
  if (!run) return null;

  db.prepare(`UPDATE runs SET notes = ? WHERE id = ?`).run(note, runId);
  return { runId, note, updated: true };
}


export function detectIssues(runId) {
  const run = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId);
  if (!run) return null;

  const metrics = db.prepare(`
    SELECT key, value, step FROM metrics
    WHERE run_id = ?
    ORDER BY step ASC
  `).all(runId);

  const metricsByKey = {};
  for (const m of metrics) {
    if (!metricsByKey[m.key]) metricsByKey[m.key] = [];
    metricsByKey[m.key].push({ step: m.step, value: m.value });
  }

  const issues = [];
  const info = [];


  if (metricsByKey['loss']) {
    const lossValues = metricsByKey['loss'];
    const firstLoss = lossValues[0].value;
    const lastLoss = lossValues[lossValues.length - 1].value;
    if (lastLoss > firstLoss) {
      issues.push({
        type: 'loss_divergence',
        severity: 'high',
        message: `Loss increased over training: ${firstLoss.toFixed(4)} → ${lastLoss.toFixed(4)}. Model is diverging or learning rate is too high.`
      });
    }
  }

  if (metricsByKey['accuracy'] && metricsByKey['val_accuracy']) {
    const trainAcc = metricsByKey['accuracy'];
    const valAcc   = metricsByKey['val_accuracy'];

    const midpoint  = Math.floor(trainAcc.length / 2);
    const trainDiff = trainAcc[trainAcc.length - 1].value - trainAcc[midpoint].value;
    const valDiff   = valAcc[valAcc.length - 1].value   - valAcc[midpoint].value;

    if (trainDiff > 0.05 && valDiff < -0.02) {
      issues.push({
        type: 'overfitting',
        severity: 'high',
        message: `Overfitting detected: training accuracy rose by ${(trainDiff*100).toFixed(1)}% in the second half while val accuracy dropped by ${(Math.abs(valDiff)*100).toFixed(1)}%.`
      });
    }
  }


  if (metricsByKey['val_accuracy']) {
    const valAcc  = metricsByKey['val_accuracy'];
    const firstVal = valAcc[0].value;
    const lastVal  = valAcc[valAcc.length - 1].value;
    const improvement = lastVal - firstVal;

    if (improvement < 0.02) {
      issues.push({
        type: 'no_improvement',
        severity: 'medium',
        message: `val_accuracy barely improved: ${firstVal.toFixed(4)} → ${lastVal.toFixed(4)} (Δ${improvement.toFixed(4)}). Learning rate may be too small or model is stuck.`
      });
    } else {
      info.push({
        type: 'healthy_improvement',
        message: `val_accuracy improved by ${(improvement*100).toFixed(1)}% over training.`
      });
    }
  }

  if (metricsByKey['val_accuracy']) {
    const valAcc = metricsByKey['val_accuracy'];
    if (valAcc.length >= 3) {
      const earlyChange = Math.abs(valAcc[2].value - valAcc[0].value);
      if (earlyChange < 0.005) {
        issues.push({
          type: 'slow_start',
          severity: 'low',
          message: `Almost no movement in val_accuracy in first 3 epochs (Δ${earlyChange.toFixed(4)}). Model may need warmup or higher initial learning rate.`
        });
      }
    }
  }

  return {
    runId,
    runName: run.run_name,
    status: run.status,
    issuesFound: issues.length,
    issues,
    info
  };
}

export function savePattern(experimentId, patternType, observation, confidence = 'medium') {
  const existing = db.prepare(`
    SELECT id FROM patterns
    WHERE observation = ?
    AND (experiment_id = ? OR experiment_id IS NULL)
  `).get(observation, experimentId);

  if (existing) {
    return { saved: false, reason: 'identical pattern already exists', id: existing.id };
  }

  const cursor = db.prepare(`
    INSERT INTO patterns (experiment_id, pattern_type, observation, confidence)
    VALUES (?, ?, ?, ?)
  `).run(experimentId, patternType, observation, confidence);

  return { saved: true, id: cursor.lastInsertRowid };
}

export function getPatterns(experimentId = null) {
  if (experimentId) {
    return db.prepare(`
      SELECT * FROM patterns
      WHERE experiment_id = ? OR experiment_id IS NULL
      ORDER BY created_at DESC
    `).all(experimentId);
  }

  return db.prepare(`
    SELECT * FROM patterns
    ORDER BY created_at DESC
  `).all();
}

export default db;


