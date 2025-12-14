# Backend Setup

## Environment Variables

Create a `.env` file in the `backend/` directory with your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
PORT=8000
```

### Where to find these values:

1. **SUPABASE_URL**: 
   - Go to your Supabase project dashboard
   - Settings → API
   - Copy the "Project URL"

2. **SUPABASE_SERVICE_KEY**:
   - Same page (Settings → API)
   - Copy the "service_role" key (NOT the anon key)
   - ⚠️ **Important**: Use the service_role key, not the anon key. The service_role key has admin privileges and should only be used server-side.

## Installation

```bash
cd backend
pip install -r requirements.txt
```

## Running

```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`

## Frontend Configuration

Your frontend apps should set:
```env
VITE_API_URL=http://localhost:8000
```

Or in production:
```env
VITE_API_URL=https://api.norebox.com
```

**Note**: Frontend apps NO LONGER need Supabase keys - they only need the API URL.

