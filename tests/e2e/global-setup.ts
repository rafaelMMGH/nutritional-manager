import { cloneDatabase } from "./database";

export default function globalSetup() {
  cloneDatabase();
}
