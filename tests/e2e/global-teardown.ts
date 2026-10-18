import { dropDatabase } from "./database";

export default function globalTeardown() {
  dropDatabase();
}
