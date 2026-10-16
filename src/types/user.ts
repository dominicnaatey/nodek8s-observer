export interface User {
  id: string;        // UUID
  name: string;      // required, non-empty
  email: string;     // required, valid format
  createdAt: string; // ISO 8601 timestamp
}
