# kuzu-mcp-server

A Model Context Protocol server that provides access to Kuzu databases. This server enables LLMs to inspect database schemas and execute queries on provided kuzu database.

## Components
### Tools 
- getSchema
  -  Fetch the full schema of the Kuzu database, including all nodes and relationships tables and their properties.
  -  Input: None

- query
  - Run a Cypher query on the Kuzu database.
  - Input: `cypher` (string): The Cypher query to run.

## Usage with Claude Desktop
### With Node.js and npm
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

### With Docker
- Build the Docker image: `docker build -t kuzu-mcp-server .`
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
                "kuzu-mcp-server"
            ]
        }
    }
  }
  ```
  Change the `{Absolute Path to the Kuzu database}` to the actual path
- Restart Claude Desktop
