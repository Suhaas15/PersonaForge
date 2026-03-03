import neo4j, { type Driver } from "neo4j-driver";

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER;
const password = process.env.NEO4J_PASSWORD;

let driver: Driver | null = null;

export function getNeo4jDriver(): Driver {
  if (!driver) {
    if (!uri || !user || !password) {
      throw new Error("Neo4j configuration is missing. Set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD.");
    }

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  return driver;
}

