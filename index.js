const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const kuzu = require("kuzu");
const path = require("path");
const TABLE_TYPES = {
  NODE: "NODE",
  REL: "REL",
};

const bigIntReplacer = (_, value) => {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

const server = new Server(
  {
    name: "kuzu",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  },
);

let dbPath;

const args = process.argv.slice(2);
if (args.length === 0) {
  const envDbDir = process.env.KUZU_DB_DIR;
  const envDbFile = process.env.KUZU_DB_FILE;
  if (envDbDir && envDbFile) {
    dbPath = path.join(envDbDir, envDbFile);
  } else {
    console.error("Please provide a path to kuzu database as a command line argument or set KUZU_DB_FILE environment variable if you are launching the server in a container.");
    process.exit(1);
  }
} else {
  dbPath = args[0];
}

const isReadOnly = process.env.KUZU_READ_ONLY === "true";

process.on("SIGINT", () => {
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});

const db = new kuzu.Database(dbPath, 0, true, isReadOnly);
const conn = new kuzu.Connection(db);

const getPrompt = (question, schema) => {
  const prompt = `Task:Generate Kuzu Cypher statement to query a graph database.
Instructions:
Generate the Kuzu dialect of Cypher with the following rules in mind:
1. It is recommended to always specifying node and relationship labels explicitly in the \`CREATE\` and \`MERGE\` clause. If not specified, Kuzu will try to infer the label by looking at the schema.
2. \`FINISH\` is recently introduced in GQL and adopted by Neo4j but not yet supported in Kuzu. You can use \`RETURN COUNT(*)\` instead which will only return one record.
3. \`FOREACH\` is not supported. You can use \`UNWIND\` instead.
4. Kuzu can scan files not only in the format of CSV, so the \`LOAD CSV FROM\` clause is renamed to \`LOAD FROM\`.
5. Relationship cannot be omitted. For example \`--\`, \`-- > \` and \`< --\` are not supported. You need to use \` - [] - \`, \` - [] -> \` and \` < -[] -\` instead.
6. Neo4j adopts trail semantic (no repeated edge) for pattern within a \`MATCH\` clause. While Kuzu adopts walk semantic (allow repeated edge) for pattern within a \`MATCH\` clause. You can use \`is_trail\` or \`is_acyclic\` function to check if a path is a trail or acyclic.
7. Since Kuzu adopts trail semantic by default, so a variable length relationship needs to have a upper bound to guarantee the query will terminate. If upper bound is not specified, Kuzu will assign a default value of 30.
8. To run algorithms like (all) shortest path, simply add \`SHORTEST\` or \`ALL SHORTEST\` between the kleene star and lower bound. For example,  \`MATCH(n) - [r * SHORTEST 1..10] -> (m)\`. It is recommended to use \`SHORTEST\` if paths are not needed in the use case.
9. \`REMOVE\` is not supported. Use \`SET n.prop = NULL\` instead.
10. Properties must be updated in the form of \`n.prop = expression\`. Update all properties with map of \` +=\` operator is not supported. Try to update properties one by one.
11. \`USE\` graph is not supported. For Kuzu, each graph is a database.
12. Using \`WHERE\` inside node or relationship pattern is not supported, e.g. \`MATCH(n: Person WHERE a.name = 'Andy') RETURN n\`. You need to write it as \`MATCH(n: Person) WHERE n.name = 'Andy' RETURN n\`.
13. Filter on node or relationship labels is not supported, e.g. \`MATCH (n) WHERE n:Person RETURN n\`. You need to write it as \`MATCH(n: Person) RETURN n\`, or \`MATCH(n) WHERE label(n) = 'Person' RETURN n\`.
14. Any \`SHOW XXX\` clauses become a function call in Kuzu. For example, \`SHOW FUNCTIONS\` in Neo4j is equivalent to \`CALL show_functions() RETURN *\` in Kuzu.
15. Kuzu supports \`EXISTS\` and \`COUNT\` subquery.
16. \`CALL <subquery>\` is not supported.

Use only the provided node types, relationship types and properties in the schema.
Do not use any other node types, relationship types or properties that are not provided explicitly in the schema.
Schema:
${JSON.stringify(schema, null, 2)}
Note: Do not include any explanations or apologies in your responses.
Do not respond to any questions that might ask anything else than for you to construct a Cypher statement.
Do not include any text except the generated Cypher statement.

The question is:
${question}
`;
  return prompt;
};

const getSchema = async (connection) => {
  const result = await connection.query("CALL show_tables() RETURN *;");
  const tables = await result.getAll();
  result.close();
  const nodeTables = [];
  const relTables = [];
  for (const table of tables) {
    const properties = (
      await connection
        .query(`CALL TABLE_INFO('${table.name}') RETURN *;`)
        .then((res) => res.getAll())
    ).map((property) => ({
      name: property.name,
      type: property.type,
      isPrimaryKey: property["primary key"],
    }));
    if (table.type === TABLE_TYPES.NODE) {
      delete table["type"];
      delete table["database name"];
      table.properties = properties;
      nodeTables.push(table);
    } else if (table.type === TABLE_TYPES.REL) {
      delete table["type"];
      delete table["database name"];
      properties.forEach((property) => {
        delete property.isPrimaryKey;
      });
      table.properties = properties;
      const connectivity = await connection
        .query(`CALL SHOW_CONNECTION('${table.name}') RETURN *;`)
        .then((res) => res.getAll());
      table.connectivity = [];
      connectivity.forEach(c => {
        table.connectivity.push({
          src: c["source table name"],
          dst: c["destination table name"],
        });
      });
      relTables.push(table);
    }
  }
  nodeTables.sort((a, b) => a.name.localeCompare(b.name));
  relTables.sort((a, b) => a.name.localeCompare(b.name));
  return { nodeTables, relTables };
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query",
        description: "Run a Cypher query on the Kuzu database",
        inputSchema: {
          type: "object",
          properties: {
            cypher: {
              type: "string",
              description: "The Cypher query to run",
            },
          },
        },
      },
      {
        name: "getSchema",
        description: "Get the schema of the Kuzu database",
        inputSchema: {
          type: "object",
          properties: {},
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "query") {
    const cypher = request.params.arguments.cypher;
    try {
      const queryResult = await conn.query(cypher);
      const rows = await queryResult.getAll();
      queryResult.close();
      return {
        content: [{
          type: "text", text: JSON.stringify(rows, bigIntReplacer, 2)
        }],
        isError: false,
      };
    } catch (error) {
      throw error;
    }
  } else if (request.params.name === "getSchema") {
    const schema = await getSchema(conn);
    return {
      content: [{ type: "text", text: JSON.stringify(schema, null, 2) }],
      isError: false,
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "generateKuzuCypher",
        description: "Generate a Cypher query for Kuzu",
        arguments: [
          {
            name: "question",
            description: "The question in natural language to generate the Cypher query for",
            required: true,
          },
        ]
      }
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === "generateKuzuCypher") {
    const question = request.params.arguments.question;
    const schema = await getSchema(conn);
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: getPrompt(question, schema),
          }
        }
      ]
    }
  }
  throw new Error(`Unknown prompt: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
});
