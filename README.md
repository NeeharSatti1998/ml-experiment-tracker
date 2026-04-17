# ML Experiment Tracker — MCP Server

An MCP (Model Context Protocol) server that gives Claude direct access to your ML experiment database. Ask questions about your training runs in plain English — Claude reads your real data and reasons over it like a senior ML engineer.

Built as a portfolio project while transitioning into AI/ML engineering. Takes about a week to build from scratch.

---

## The problem it solves

Every ML engineer has felt this: you've run 20 experiments, metrics are scattered across runs, and you can't remember which config produced your best result or why run 14 beat run 9.

Tools like MLflow solve the logging part. But they don't explain *why* something happened, catch problems automatically, or suggest what to try next based on your actual history.

This project connects Claude directly to your experiment database so you can ask:

- *"Which run performed best on val_accuracy?"*
- *"Why did run 1 outperform run 2?"*
- *"Scan run 3 for training issues"*
- *"What learning rate should I try next?"*
- *"What did you learn from previous sessions?"*

---

## Real results

Tested on the breast cancer dataset (569 samples, 30 features, binary classification):

| Run | LR | Architecture | Val Accuracy | Val F1 |
|-----|----|-------------|-------------|--------|
| mlp-lr0.01-small | 0.01 | (64, 32) | **98.2%** | **98.6%** |
| mlp-lr0.001-small | 0.001 | (64, 32) | 97.4% | 97.9% |
| mlp-lr0.001-large | 0.001 | (128, 64, 32) | 97.4% | 97.9% |
| mlp-lr0.0001-large | 0.0001 | (128, 64, 32) | 97.4% | 97.9% |

Claude automatically detected:
- **Overfitting** on run 3 — train accuracy hit 100% by epoch 21, val accuracy plateaued. Flagged with exact epoch evidence.
- **Slow start** on run 4 — near-zero movement in first 3 epochs, wasted ~6% of training budget.
- **Production recommendation** — lr=0.01 with (64,32) architecture. Smallest train-val gap (1.1%) of any competitive model.

---

## How it works

```
Your training script (Python)
        ↓ logs params + metrics
    SQLite database
        ↓ queried by
    MCP Server (Node.js)
        ↓ tools exposed to
    Claude Desktop
        ↓ answers your questions
```

The MCP server exposes 10 tools Claude can call. Claude decides which tools to use based on your question, reads the data, and reasons over it.

---

## Tools

| Tool | What it does |
|------|-------------|
| `list_experiments` | Overview of all experiments and run counts |
| `get_runs` | All runs inside an experiment |
| `get_run_details` | Full params, metrics, and epoch-by-epoch history |
| `get_best_run` | Top performer by any metric |
| `get_metric_history` | How a metric trended across all runs |
| `compare_runs` | Side-by-side diff — exactly what params changed, metric deltas |
| `detect_issues` | Flags loss divergence, overfitting, no improvement, slow start |
| `add_note` | Annotate a run with observations |
| `save_pattern` | Save learned insights to long-term memory |
| `get_patterns` | Load patterns from previous sessions |

### Cross-session memory

The `save_pattern` and `get_patterns` tools give Claude persistent memory between conversations. After analyzing your experiments, Claude saves what it learns — best configs, failure patterns, dataset-specific insights. The next session it loads those patterns first and starts with existing knowledge.

Opening a new chat and asking *"what experiment should I run next?"* with zero context — Claude immediately knew the architecture, best learning rate, and gave a 3-step roadmap from patterns saved in a previous session.

### Hybrid reasoning

`detect_issues` uses deterministic rules — not LLM guessing. It checks:
- Is final loss higher than starting loss? → `loss_divergence`
- Is train accuracy rising while val accuracy drops? → `overfitting`
- Did val accuracy barely move across all epochs? → `no_improvement`
- Was there almost no movement in the first 3 epochs? → `slow_start`

Claude then explains what the flags mean and suggests fixes in plain English.

---

## Project structure

```
ml-experiment-tracker/
├── mcp-server/
│   ├── server.js       # MCP server — all 10 tools
│   ├── database.js     # SQLite queries, schema, migrations
│   └── package.json
└── mltrack/
    ├── tracker.py      # Python SDK for logging
    ├── example_train.py   # Simulated training runs
    └── real_train.py      # Real sklearn MLP experiments
```

---

## Setup

### 1. Install Node.js dependencies

```bash
cd mcp-server
npm install
```

### 2. Install Python dependencies

```bash
pip install scikit-learn numpy
```

### 3. Connect to Claude Desktop

Find your Claude Desktop config file:
- **Windows (Store):** `C:\Users\{you}\AppData\Local\Packages\Claude_*\LocalCache\Roaming\Claude\claude_desktop_config.json`
- **Windows (installer):** `%APPDATA%\Claude\claude_desktop_config.json`
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Add this:

```json
{
  "mcpServers": {
    "ml-experiment-tracker": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/server.js"]
    }
  }
}
```

Restart Claude Desktop. You should see the server listed as `running` in Settings → Developer.

### 4. Log your first experiment

```python
from tracker import MLTracker

tracker = MLTracker('my-experiment', 'description here')
tracker.start_run('run-1')

tracker.log_params({
    'learning_rate': 0.01,
    'batch_size': 32,
    'epochs': 50
})

for epoch in range(50):
    # your training code here
    tracker.log_metric('val_accuracy', accuracy, step=epoch)
    tracker.log_metric('loss', loss, step=epoch)

tracker.end_run()
```

### 5. Run the example experiments

```bash
# Simulated runs (no ML libraries needed)
python mltrack/example_train.py

# Real sklearn MLP on breast cancer dataset
python mltrack/real_train.py
```

### 6. Ask Claude

```
What experiments do I have?
Which run performed best on val_accuracy?
Scan run 2 for issues
Compare run 1 and run 3
Based on my history, what should I try next?
```

---

## Tech stack

- **MCP Server** — Node.js with `@modelcontextprotocol/sdk`
- **Database** — SQLite via `better-sqlite3`
- **Python SDK** — built-in `sqlite3`, no extra dependencies
- **ML experiments** — scikit-learn, numpy
- **Interface** — Claude Desktop

---

## What I learned building this

- How the MCP protocol works — tool schemas, JSON responses, stdio transport
- Relational database design — one-to-many relationships, foreign keys, migrations
- The difference between deterministic rules and LLM reasoning — and why you need both
- How to build a Python SDK that's clean to use (class-based, guard clauses, context management)
- Why cross-session memory changes how you think about AI tools

---

## Roadmap

- [ ] Vector search for failure pattern clustering across experiments
- [ ] Learning rate scheduler detection
- [ ] Support for PyTorch training loops
- [ ] Web dashboard for metric visualisation
