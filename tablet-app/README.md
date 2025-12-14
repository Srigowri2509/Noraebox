# Tablet App

React + Vite application with Tailwind CSS and Supabase integration configured and ready to run.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Supabase account (for backend functionality)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the root of `tablet-app` directory with the following variables:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ROOM_ID=your_room_id
```

You can copy `.env.example` as a template:

```bash
cp .env.example .env
```

Then fill in your actual Supabase credentials.

### Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the next available port).

### Build

Build for production:

```bash
npm run build
```

### Preview

Preview the production build:

```bash
npm run preview
```

## Features

- ⚡️ Vite for fast development
- ⚛️ React 19
- 🎨 Tailwind CSS 4.1.17
- 🗄️ Supabase integration
- 🔥 Hot Module Replacement (HMR)
- 📦 Modern ES modules
- 🛡️ ESLint configured

## Tech Stack

- **React** - UI library
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Supabase** - Backend as a Service (database, real-time, auth)
- **PostCSS** - CSS processing
- **Autoprefixer** - CSS vendor prefixing

## Project Structure

```
src/
├── components/     # Reusable UI components
├── context/        # React context providers
├── hooks/          # Custom React hooks
├── lib/            # Utility functions
├── screens/        # Page components
├── supabase/       # Supabase client configuration
├── App.jsx         # Main app component
└── main.jsx        # Entry point
```
