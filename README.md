# kuzu-mcp-server

[![smithery badge](https://smithery.ai/badge/@kuzudb/kuzu-mcp-server)](https://smithery.ai/server/@kuzudb/kuzu-mcp-server)

A Model Context Protocol server that provides access to Kuzu databases. This server enables LLMs to inspect database schemas and execute queries on provided kuzu database.

## Components
### Tools 
- getSchema
  -  Fetch the full schema of the Kuzu database, including all nodes and relationships tables and their properties
  -  Input: None

- query
  - Run a Cypher query on the Kuzu database
  - Input: `cypher` (string): The Cypher query to run

### Prompt
- generateKuzuCypher
  - Generate a Cypher query for Kuzu
  - Argument: `question` (string): The question in natural language to generate the Cypher query for

## Usage with Claude Desktop
### Installing via Smithery

To install Kuzu Database Access Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@kuzudb/kuzu-mcp-server):

```bash
npx -y @smithery/cli install @kuzudb/kuzu-mcp-server --client claude
```

### With Docker (Recommended)
- Edit the configuration file `config.json`:
  - on macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - on Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Add the following configuration to the `mcpServers` object:
  ```json
  {
    "mcpServers": {
        "kuzu": {
            "command": "docker",
            "args": [
                "run",
                "-v",
                "{Absolute Path to the Kuzu database}:/database",
                "--rm",
                "-i",
                "kuzudb/mcp-server"
            ]
        }
    }
  }
  ```
  Change the `{Absolute Path to the Kuzu database}` to the actual path
- Restart Claude Desktop

### With Node.js and npm (for Development)
- Install dependencies: `npm install`
- Edit the configuration file `config.json`:
  - on macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - on Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Add the following configuration to the `mcpServers` object:
  ```json
  {
    "mcpServers": {
        "kuzu": {
            "command": "node",
            "args": [
                "{Absolute Path to this repository}/index.js",
                "{Absolute Path to the Kuzu database}",
            ]
        }
    }
  }
  ```
  Change the `{Absolute Path to this repository}` and `{Absolute Path to the Kuzu database}` to the actual paths
- Restart Claude Desktop

### Read-Only Mode
The server can be run in read-only mode by setting the `KUZU_READ_ONLY` environment variable to `true`. In this mode, running any query that attempts to modify the database will result in an error. This flag can be set in the configuration file as follows:
```json
{
    "mcpServers": {
        "kuzu": {
            "command": "docker",
            "args": [
                "run",
                "-v",
                "{Absolute Path to the Kuzu database}:/database",
                "-e",
                "KUZU_READ_ONLY=true",
                "--rm",
                "-i",
                "kuzudb/mcp-server"
            ],
        }
    }
}
```
