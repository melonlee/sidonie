
import React from 'react';
import { X, GraduationCap, Radar, ShieldCheck, Sun, BookOpen, Moon, Github } from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { Language } from '../types';
import BrandMark from './BrandMark';

interface LandingPageProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

const REPO_URL = 'https://github.com/melonlee/FantasyAILab';

const LandingPage: React.FC<LandingPageProps> = ({ isOpen, onClose, language }) => {
  if (!isOpen) return null;

  const t = TRANSLATIONS[language];

  const features = [
    { icon: <GraduationCap size={24} />, tint: 'bg-amber-50 text-amber-700', title: t.feature1Title, desc: t.feature1Desc },
    { icon: <Radar size={24} />, tint: 'bg-blue-50 text-blue-600', title: t.feature2Title, desc: t.feature2Desc },
    { icon: <ShieldCheck size={24} />, tint: 'bg-green-50 text-green-600', title: t.feature3Title, desc: t.feature3Desc },
  ];

  const useCases = [
    { icon: <Sun size={20} />, tint: 'bg-yellow-100 text-yellow-700', text: t.useCase1 },
    { icon: <BookOpen size={20} />, tint: 'bg-gray-100 text-gray-700', text: t.useCase2 },
    { icon: <Moon size={20} />, tint: 'bg-blue-50 text-blue-700', text: t.useCase3 },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-white overflow-y-auto animate-fade-in">
      {/* Navbar */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <BrandMark size={32} className="rounded-lg shadow-lg" />
             <span className="text-xl font-bold tracking-tight text-gray-900">Sidonie</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label={t.close}
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <div className="py-20 px-6 text-center bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-3xl mx-auto">
           <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
             {t.landingTitle}
           </h1>
           <p className="text-xl md:text-2xl text-gray-700 font-light leading-relaxed">
             {t.landingSubtitle}
           </p>
           <p className="mt-4 text-base text-gray-500 leading-relaxed max-w-2xl mx-auto">
             {t.landingTagline}
           </p>
        </div>
      </div>

      {/* Features Grid */}
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-12 text-center">{t.features}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map(f => (
            <div key={f.title} className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
               <div className={`w-12 h-12 ${f.tint} rounded-xl flex items-center justify-center mb-4`}>
                  {f.icon}
               </div>
               <h3 className="text-lg font-bold text-gray-900 mb-2">{f.title}</h3>
               <p className="text-gray-600 leading-relaxed text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Use Cases */}
      <div className="bg-gray-50 py-16">
         <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-12 text-center">{t.useCases}</h2>
            <div className="space-y-4 max-w-2xl mx-auto">
               {useCases.map(u => (
                 <div key={u.text} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200">
                    <div className={`p-2 ${u.tint} rounded-lg`}>{u.icon}</div>
                    <span className="font-medium text-gray-800">{u.text}</span>
                 </div>
               ))}
            </div>
         </div>
      </div>

      {/* Story */}
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">{t.storyTitle}</h2>
        <p className="text-gray-600 leading-relaxed text-lg font-light">{t.storyBody}</p>
        <p className="mt-4 text-sm text-gray-400">{t.storySign}</p>
      </div>

      {/* Tech Stack */}
      <div className="bg-gray-50 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">{t.techStack}</h2>
          <p className="text-center text-gray-500 mb-12 max-w-2xl mx-auto">{t.techDesc}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
             {[t.tech1, t.tech2, t.tech3].map(item => (
               <div key={item} className="p-4 bg-white rounded-xl border border-gray-100">
                  <code className="text-sm font-semibold text-gray-700">{item}</code>
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 py-8 text-center text-sm text-gray-400 space-y-2">
         <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors">
           <Github size={14} /> {t.footerOpenSource}
         </a>
         <p>&copy; {new Date().getFullYear()} Melon (李辉) · FantasyAI Lab</p>
      </div>

    </div>
  );
};

export default LandingPage;
