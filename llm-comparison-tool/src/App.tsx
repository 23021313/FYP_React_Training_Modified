import React, { useState } from 'react';
import BusinessProfiler from './components/business-profiler/BusinessProfiler';
import ConsumerProfiler from './components/consumer-profiler/ConsumerProfiler';
import ResponseEvaluator from './components/response-evaluator/ResponseEvaluator';
import PromptManager from './components/prompt-manager/PromptManager';

const TABS = [
  { label: 'Business Profiler', component: <BusinessProfiler /> },
  { label: 'Consumer Profiler', component: <ConsumerProfiler /> },
  { label: 'Response Evaluator', component: <ResponseEvaluator /> },
  { label: 'Prompt Manager', component: <PromptManager /> },
];

const App = () => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-8">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden">
        <header className="flex items-center px-6 py-5 border-b bg-blue-600">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              LLM Optimization for Rally
            </h1>
            <p className="text-blue-100 text-sm mt-1">
              Business profiling, consumer analysis, and response evaluation
            </p>
          </div>
          {/* Placeholder for avatar or logo */}
          <div className="w-10 h-10 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-lg shadow-md">
            LLM
          </div>
        </header>
        <nav className="flex border-b bg-gray-50">
          {TABS.map((tab, idx) => (
            <button
              key={tab.label}
              className={`flex-1 py-3 text-center text-base font-medium transition-colors
                ${activeTab === idx
                  ? 'border-b-4 border-blue-600 text-blue-700 bg-white'
                  : 'text-gray-500 hover:text-blue-600'}
              `}
              style={{
                outline: 'none',
                transition: 'background 0.2s, color 0.2s'
              }}
              onClick={() => setActiveTab(idx)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <main className="p-6 bg-white min-h-[350px]">
          {TABS[activeTab].component}
        </main>
      </div>
    </div>
  );
};

export default App;