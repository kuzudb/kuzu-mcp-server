const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const kuzu = require("kuzu");

const SCHEMA_URI = "schema://main";
const TABLE_TYPES = {
  NODE: "NODE",
  REL: "REL",
};

const server = new Server(
  {
    name: "kuzu",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

let dbPath;

const args = process.argv.slice(2);
if (args.length === 0) {
  const envDbPath = process.env.KUZU_DB_PATH;
  if (envDbPath) {
    dbPath = envDbPath;
  } else {
    console.error("Please provide a path to kuzu database as a command line argument");
    process.exit(1);
  }
} else {
  dbPath = args[0];
}

process.on("SIGINT", () => {
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});

const db = new kuzu.Database(dbPath);
const conn = new kuzu.Connection(db);

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
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
});
