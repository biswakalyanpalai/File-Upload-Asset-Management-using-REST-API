# 📁 File Upload & Asset Management REST API (Drive / Dropbox Clone)

A feature-complete, production-ready REST API built with **Node.js**, **TypeScript**, **Express**, **SQLite**, **JWT Authentication**, and **Multer**.

---

## 🚀 Features

* **🔐 Authentication & User Quota Management**
  * Secure User Registration & Login with `bcryptjs` password hashing and `JWT` tokens.
  * Per-user storage quota enforcement (e.g. 50MB default limit).
  * Storage limit validation during file upload (returns `413 Payload Too Large` if quota exceeded).

* **📂 Folder Hierarchy & Organization**
  * Create, list, rename, and delete folders.
  * Hierarchical folder trees with parent/child relationships (`GET /api/v1/folders/:id/contents`).

* **📤 Multipart File Upload & Storage**
  * File uploads via `multer`.
  * SHA-256 cryptographic checksum calculation for file integrity and deduplication tracking.
  * Metadata tracking (file name, original name, mime type, size, hash, storage path, trash state).

* **📥 File Streaming & Previews**
  * Attachment download stream (`GET /api/v1/files/:id/download`).
  * Inline preview stream (`GET /api/v1/files/:id/view`).

* **🔗 Shareable Public Links**
  * Generate public share tokens with optional expiration time (`POST /api/v1/files/:id/share`).
  * Unauthenticated public file download (`GET /api/v1/public/share/:token`).

* **🗑️ Trash, Recovery & Permanent Delete**
  * Soft delete files to Trash (`POST /api/v1/files/:id/trash`).
  * Restore files from Trash (`POST /api/v1/files/:id/restore`).
  * Permanent deletion reclaims physical disk space and updates user storage quota.

* **📊 Storage Analytics**
  * Storage breakdown by MIME type, active file counts, folder count, and trash usage (`GET /api/v1/analytics/storage`).

---

## 🛠️ Project Structure

```
├── src/
│   ├── app.ts                  # Express application setup & middleware
│   ├── server.ts               # Server startup & DB migration entrypoint
│   ├── config.ts               # Environment configuration loader
│   ├── db/
│   │   └── database.ts         # SQLite schema & async query wrapper
│   ├── middleware/
│   │   ├── auth.ts             # JWT authentication middleware
│   │   └── upload.ts           # Multer file upload setup
│   ├── controllers/
│   │   ├── auth.controller.ts  # Auth & profile handlers
│   │   ├── file.controller.ts  # File CRUD, preview, share & stream handlers
│   │   ├── folder.controller.ts# Folder hierarchy handlers
│   │   └── analytics.controller.ts # Storage quota analytics
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── file.routes.ts
│   │   ├── folder.routes.ts
│   │   ├── analytics.routes.ts
│   │   ├── public.routes.ts
│   │   └── index.ts            # Combined route router
│   └── tests/
│       └── e2e.test.ts         # Automated E2E integration test suite
├── uploads/                    # Local storage folder for assets
├── .env                        # Local environment file
├── tsconfig.json               # TypeScript configuration
└── package.json
```

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```env
PORT=3000
JWT_SECRET=super-secret-key-change-in-production
JWT_EXPIRES_IN=7d
STORAGE_DIR=./uploads
DEFAULT_STORAGE_LIMIT_MB=50
```

### 3. Build & Run
* **Development mode**:
  ```bash
  npm run dev
  ```
* **Production Build**:
  ```bash
  npm run build
  npm start
  ```

### 4. Run Automated Test Suite
```bash
npm test
```

---

## 📡 API Endpoints Reference

### 🔐 Auth Routes (`/api/v1/auth`)
| Method | Endpoint | Description | Auth Required |
| --- | --- | --- | --- |
| `POST` | `/register` | Register a new user | No |
| `POST` | `/login` | User login & retrieve JWT token | No |
| `GET` | `/profile` | Get profile & storage quota details | Yes |

### 📂 Folder Routes (`/api/v1/folders`)
| Method | Endpoint | Description | Auth Required |
| --- | --- | --- | --- |
| `POST` | `/` | Create a folder | Yes |
| `GET` | `/` | List folders (`?parent_id=root`) | Yes |
| `GET` | `/:id/contents` | Get subfolders & files inside folder | Yes |
| `PATCH` | `/:id/rename` | Rename folder | Yes |
| `DELETE` | `/:id` | Delete folder | Yes |

### 📄 File Routes (`/api/v1/files`)
| Method | Endpoint | Description | Auth Required |
| --- | --- | --- | --- |
| `POST` | `/upload` | Multipart file upload (`file`, `folder_id`) | Yes |
| `GET` | `/` | List user files (`?search=query`, `?trashed=true`) | Yes |
| `GET` | `/:id/download` | Stream attachment download | Yes |
| `GET` | `/:id/view` | Stream inline preview | Yes |
| `PATCH` | `/:id/rename` | Rename file | Yes |
| `PATCH` | `/:id/move` | Move file to target folder | Yes |
| `POST` | `/:id/trash` | Soft delete file to Trash | Yes |
| `POST` | `/:id/restore` | Restore file from Trash | Yes |
| `DELETE` | `/:id` | Permanently delete file & reclaim storage | Yes |
| `POST` | `/:id/share` | Generate public share link | Yes |

### 🌐 Public Share Route (`/api/v1/public`)
| Method | Endpoint | Description | Auth Required |
| --- | --- | --- | --- |
| `GET` | `/share/:token` | Public file download via token | No |

### 📊 Analytics Route (`/api/v1/analytics`)
| Method | Endpoint | Description | Auth Required |
| --- | --- | --- | --- |
| `GET` | `/storage` | Storage usage breakdown & file type stats | Yes |
