import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod';
import {
    listExperiments,
    getRunsForExperiment,
    getRunDetails,
    getBestRun,
    getMetricHistory,
    compareRuns,
    detectIssues,
    addNoteToRun,
    savePattern,
    getPatterns
} from './database.js'

const server = new McpServer({
    name: 'ml-experiment-tracker',
    version: '1.0.0'
});

server.tool(
    'list_experiments',
    'List all ML experiments with their run counts. Call this first to get an overview of what experiment exists',
    {},
    async () => {
        const experiments = listExperiments();
        if (experiments.length === 0){
            return {
                content:[{type:'text',text:'No experiments found. Start tracking by running your training script.' }]
            };
        }

        return {
            content: [{type:'text', text: JSON.stringify(experiments,null,2)}]
        };

    }
);


server.tool(
    'get_runs',
    'Get all the run for a specific experiment. Return run names, status and timestamps.',
    {experimentId: z.number().describe('The ID of the experiment')},
    async ({experimentId}) => {
        const runs = getRunsForExperiment(experimentId);
        if (runs.length === 0){
            return {
                content:[{type:'text',text:`No runs found for experiment ${experimentId}`}]
            };
        }

        return {
            content:[{type:'text',text:JSON.stringify(runs,null,2)}]
        };
    }
);



server.tool(
    'get_run_details',
    'Get full details of a specific run including all hyperparameters, final metrics, and metrics across epochs.',
    {runId: z.number().describe('The ID of the run')},
    async ({runId}) => {
        const details = getRunDetails(runId);
        if (!details) {
            return {
                content:[{type:'text',text:`Run ${runId} not found`}]
            };
        }

        return{
            content:[{type:'text',text:JSON.stringify(details,null,2)}]
        };
    }
);


server.tool(
    'get_best_run',
    'Find the best performing run for a metric. Use higher_is_better = True for accuracy/f1, false for loss',
    {
        experimentId: z.number().describe('The experiment ID to search within'),
        metricKey: z.string().describe('Metric name eg. val_accuracy, loss'),
        higherIsBetter: z.boolean().default(true).describe('True for Accuracy/f1, false for loss')
    },
    async ({experimentId,metricKey,higherIsBetter}) => {
        const best = getBestRun(experimentId,metricKey,higherIsBetter);
        if (!best) {
            return {
                content:[{type:'text',text:`No completed runs found for metric "${metricKey}"`}]
            };
        }
        return{
            content:[{type:'text',text:JSON.stringify(best,null,2)}]
        };
    }
);

server.tool(
    'get_metric_history',
    'Get how a metric is changed across all the runs over time. Use this spot trends and improvements.',
    {
        experimentId: z.number().describe('The experiment ID'),
        metricKey: z.string().describe('Metric name e.g. val_accuracy, loss')
    },
    async ({experimentId,metricKey}) => {
        const history = getMetricHistory(experimentId,metricKey);
        if (history.length === 0) {
            return {
                content:[{type:'text',text:`No history found for metric "${metricKey}"`}]
            };
        }
        return{
            content:[{type:'text',text:JSON.stringify(history,null,2)}]
        };
    }
);


server.tool(
    'compare_runs',
    'Compare two runs side by side. Shows exactly what params changed and how metrics differed. Use this when the user asks why one run beat another.',
    {
        runIdA: z.number().describe('ID of the first run'),
        runIdB: z.number().describe('ID of the second run')
    },
    async ({ runIdA, runIdB }) => {
        const comparison = compareRuns(runIdA, runIdB);
        if (!comparison) {
            return {
                content: [{ type: 'text', text: `One or both runs not found.` }]
            };
        }
        return {
            content: [{ type: 'text', text: JSON.stringify(comparison, null, 2) }]
        };
    }
);


server.tool(
    'detect_issues',
    'Automatically scan a run for problems: loss divergence, overfitting, no improvement, slow start. Call this when a run performed poorly or the user wants to debug.',
    {
        runId: z.number().describe('The ID of the run to scan')
    },
    async ({ runId }) => {
        const result = detectIssues(runId);
        if (!result) {
            return {
                content: [{ type: 'text', text: `Run ${runId} not found.` }]
            };
        }
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
    }
);


server.tool(
    'add_note',
    'Add a note or observation to a specific run. Use when the user wants to annotate a run with context like "tried higher dropout" or "used augmented dataset".',
    {
        runId: z.number().describe('The ID of the run to annotate'),
        note:  z.string().describe('The note or observation to attach')
    },
    async ({ runId, note }) => {
        const result = addNoteToRun(runId, note);
        if (!result) {
            return {
                content: [{ type: 'text', text: `Run ${runId} not found.` }]
            };
        }
        return {
            content: [{ type: 'text', text: `Note added to run ${runId}: "${note}"` }]
        };
    }
);


server.tool(
    'save_pattern',
    'Save a learned pattern or insight to long-term memory. Call this when you notice a consistent pattern across runs — e.g. a hyperparameter that reliably helps or hurts. This persists between conversations.',
    {
        experimentId: z.number().nullable().describe('Experiment ID this applies to, or null for global patterns'),
        patternType:  z.string().describe('Category: hyperparameter, architecture, data, or general'),
        observation:  z.string().describe('The actual insight e.g. "Adam with lr>0.01 diverges on this dataset"'),
        confidence:   z.enum(['low', 'medium', 'high']).default('medium').describe('How confident based on evidence seen')
    },
    async ({ experimentId, patternType, observation, confidence }) => {
        const result = savePattern(experimentId, patternType, observation, confidence);
        if (!result.saved) {
            return {
                content: [{ type: 'text', text: `Pattern already recorded: "${observation}"` }]
            };
        }
        return {
            content: [{ type: 'text', text: `Pattern saved (id=${result.id}): "${observation}"` }]
        };
    }
);

server.tool(
    'get_patterns',
    'Retrieve all learned patterns from memory. Call this at the START of a conversation to load existing knowledge before analyzing experiments. Returns patterns learned in previous sessions.',
    {
        experimentId: z.number().nullable().optional().describe('Filter by experiment ID, or omit for all patterns')
    },
    async ({ experimentId }) => {
        const patterns = getPatterns(experimentId);
        if (patterns.length === 0) {
            return {
                content: [{ type: 'text', text: 'No patterns learned yet. Run some experiments and I will start building memory.' }]
            };
        }
        return {
            content: [{ type: 'text', text: JSON.stringify(patterns, null, 2) }]
        };
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);
