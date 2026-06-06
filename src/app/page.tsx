import CompilerDashboard from '@/components/CompilerDashboard';

export const metadata = {
  title: 'Nexus Studio — AI-Native Application Generation Platform',
  description: 'Compile natural language application specifications into typed database schemas, security policies, system architecture, and live interactive runtime environments.',
};

export default function Home() {
  return <CompilerDashboard />;
}
