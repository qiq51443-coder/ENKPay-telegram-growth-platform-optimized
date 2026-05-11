import React, { useEffect, useState, useRef } from 'react';
import { theme } from '../theme';
import { api } from '../services/api';
import { useLang } from '../context/LanguageContext';
import { useMiniAppBg, buildBgStyle } from '../hooks/useMiniAppBg';

type CharityView = 'list' | 'detail';

interface CharityProject {
  id: string;
  title: string;
  description: string;
  image_url?: string | null;
  status: 'active' | 'completed' | 'cancelled';
  ambassador_telegram?: string;
  is_active?: boolean;
  show_in_app?: boolean;
  goal_amount?: number | string;
  raised_amount?: number | string;
  organization?: string | null;
  progress_override?: number | null;
  progress_images?: string[];
}

interface CharityBanner {
  id: string;
  image_url?: string | null;
  title?: string;
}

const BANNER_ROTATION_INTERVAL = 10000; // 10 seconds

const resolveImageUrl = (url: string | null | undefined): string => {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) return url;
  const apiBase = ((import.meta as any).env?.VITE_API_URL || '/api').replace(/\/api$/, '');
  return `${apiBase}${url}`;
};

const calcFundingPercent = (raised: number | string | undefined, goal: number | string | undefined): number => {
  const g = Number(goal);
  return g > 0 ? Math.min(100, (Number(raised || 0) / g) * 100) : 0;
};

const getDisplayPercent = (project: CharityProject): number => {
  if (project.status === 'completed') return 100;
  if (project.progress_override != null) return Math.min(100, Math.max(0, Number(project.progress_override)));
  return calcFundingPercent(project.raised_amount, project.goal_amount);
};

export const Charity: React.FC = () => {
  const { t, lang } = useLang();
  const bgUrl = useMiniAppBg('charity');
  const [projects, setProjects] = useState<CharityProject[]>([]);
  const [banners, setBanners] = useState<CharityBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CharityView>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pageBgStyle = buildBgStyle(bgUrl);

  const selected = projects.find(p => p.id === selectedId) || null;

  useEffect(() => {
    fetchData(lang);
  }, [lang]);

  useEffect(() => {
    if (banners.length <= 1) return;
    bannerTimer.current = setInterval(() => {
      setBannerIndex(i => (i + 1) % banners.length);
    }, BANNER_ROTATION_INTERVAL);
    return () => {
      if (bannerTimer.current) clearInterval(bannerTimer.current);
    };
  }, [banners.length]);

  const fetchData = async (currentLang: string) => {
    try {
      const [projRes, bannerRes] = await Promise.allSettled([
        api.get('/charity/projects', { params: { lang: currentLang } }),
        api.get('/charity/banners'),
      ]);
      if (projRes.status === 'fulfilled') {
        setProjects(projRes.value.data?.data || projRes.value.data?.projects || []);
      }
      if (bannerRes.status === 'fulfilled') {
        setBanners(bannerRes.value.data?.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  if (view === 'detail' && selected) {
    const hasAmbassador = !!selected.ambassador_telegram;
    return (
      <div style={{ ...pageBgStyle, paddingBottom: '80px' }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => { setView('list'); setSelectedId(null); }}
            style={{ background: 'none', border: 'none', color: theme.textSecondary, fontSize: '16px', cursor: 'pointer', padding: 0 }}
          >
            {t('back')}
          </button>
        </div>

        {selected.image_url && (
          <div style={{ width: '100%', height: '200px', overflow: 'hidden' }}>
            <img src={resolveImageUrl(selected.image_url)} alt={selected.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        <div style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ color: theme.text, fontSize: '20px', margin: 0, flex: 1 }}>{selected.title}</h2>
            <span style={{
              fontSize: '11px', padding: '2px 8px', borderRadius: '4px', marginLeft: '8px',
              backgroundColor: selected.status === 'active' ? theme.success : theme.textSecondary,
              color: '#fff', whiteSpace: 'nowrap',
            }}>
              {selected.status === 'active' ? t('charity_active') : t('charity_ended')}
            </span>
          </div>

          {selected.organization && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: theme.textSecondary }}>🏢 {t('charity_organization')}：</span>
              <span style={{ fontSize: '13px', color: theme.text, fontWeight: '600' }}>{selected.organization}</span>
            </div>
          )}

          {(selected.goal_amount || selected.raised_amount) && (
            <div style={{ backgroundColor: theme.bgCardHover, borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: theme.textSecondary }}>{t('charity_raised')}</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#F0B90B' }}>{Number(selected.raised_amount || 0).toFixed(2)} <span style={{ fontSize: '11px' }}>USDT</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: theme.textSecondary }}>{t('charity_goal')}</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{Number(selected.goal_amount || 0).toFixed(2)} <span style={{ fontSize: '11px' }}>USDT</span></div>
                </div>
              </div>
              <div style={{ height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${getDisplayPercent(selected)}%`,
                  backgroundColor: '#F0B90B',
                  borderRadius: '3px',
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{ textAlign: 'center', fontSize: '11px', color: theme.textSecondary, marginTop: '4px' }}>
                {`${getDisplayPercent(selected).toFixed(1)}%`}
              </div>
            </div>
          )}

          {selected.description && (
            <p style={{ color: theme.textSecondary, fontSize: '14px', lineHeight: '1.7', marginBottom: '24px' }}>
              {selected.description}
            </p>
          )}

          {selected.progress_images && selected.progress_images.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '8px', fontWeight: '600' }}>📷 项目进展图片</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {selected.progress_images.map((imgUrl, idx) => (
                  <img
                    key={idx}
                    src={resolveImageUrl(imgUrl)}
                    alt={`progress-${idx + 1}`}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer' }}
                    onClick={() => window.open(resolveImageUrl(imgUrl), '_blank')}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ position: 'fixed', bottom: '68px', left: '16px', right: '16px' }}>
          <button
            disabled={!hasAmbassador}
            onClick={() => {
              if (!hasAmbassador) return;
              const url = `https://t.me/${selected.ambassador_telegram}`;
              const tg = (window as any).Telegram?.WebApp;
              if (tg?.openTelegramLink) {
                tg.openTelegramLink(url);
              } else if (tg?.openLink) {
                tg.openLink(url);
              } else {
                window.open(url, '_blank');
              }
            }}
            style={{
              width: '100%', padding: '14px', border: 'none', borderRadius: '10px',
              backgroundColor: hasAmbassador ? '#F0B90B' : theme.bgCardHover,
              color: hasAmbassador ? '#000' : theme.textSecondary,
              fontSize: '16px', fontWeight: '600', cursor: hasAmbassador ? 'pointer' : 'not-allowed',
            }}
          >
            {hasAmbassador ? t('contact_ambassador') : t('no_contact')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...pageBgStyle, paddingBottom: '80px' }}>
      <div style={{ padding: '16px 16px 0' }}>
        <h1 style={{ color: theme.text, marginBottom: '12px', fontSize: '20px' }}>{t('charity_title')}</h1>
      </div>

      {/* Banner carousel */}
      <div style={{ width: '100%', height: '180px', overflow: 'hidden', position: 'relative', marginBottom: '16px' }}>
        {banners.length > 0 ? (
          <>
            <div style={{
              display: 'flex',
              width: `${banners.length * 100}%`,
              height: '100%',
              transform: `translateX(-${(bannerIndex * 100) / banners.length}%)`,
              transition: 'transform 0.5s ease',
            }}>
              {banners.map(banner => (
                <div key={banner.id} style={{ width: `${100 / banners.length}%`, flexShrink: 0, height: '100%' }}>
                  <img src={resolveImageUrl(banner.image_url)} alt={banner.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
            {banners.length > 1 && (
              <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '6px' }}>
                {banners.map((_, i) => (
                  <div key={i} style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    backgroundColor: i === bannerIndex ? '#F0B90B' : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                  }} onClick={() => setBannerIndex(i)} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(135deg, #1a2742 0%, #243352 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: theme.textSecondary, fontSize: '14px' }}>{t('no_banners')}</span>
          </div>
        )}
      </div>

      {/* Project list */}
      <div style={{ padding: '0 16px' }}>
        {loading ? (
          <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('loading')}</div>
        ) : projects.length === 0 ? (
          <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('no_activities')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {projects.map(project => (
              <div
                key={project.id}
                onClick={() => { setSelectedId(project.id); setView('detail'); }}
                style={{
                  backgroundColor: theme.bgCard,
                  borderRadius: '12px',
                  padding: '14px',
                  border: `1px solid ${theme.border}`,
                  cursor: 'pointer',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                }}
              >
                {project.image_url ? (
                  <img src={resolveImageUrl(project.image_url)} alt={project.title} style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: '60px', height: '60px', borderRadius: '8px', backgroundColor: theme.bgCardHover, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>❤️</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <span style={{ color: theme.text, fontSize: '15px', fontWeight: '600', flex: 1, marginRight: '8px' }}>{project.title}</span>
                    <span style={{
                      fontSize: '11px', padding: '2px 6px', borderRadius: '4px', flexShrink: 0,
                      backgroundColor: project.status === 'active' ? theme.success : theme.textSecondary,
                      color: '#fff',
                    }}>
                      {project.status === 'active' ? t('charity_active') : t('charity_ended')}
                    </span>
                  </div>
                  {project.description && (
                    <p style={{ color: theme.textSecondary, fontSize: '12px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {project.description}
                    </p>
                  )}
                  {project.organization && (
                    <p style={{ color: theme.textSecondary, fontSize: '11px', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🏢 {project.organization}
                    </p>
                  )}
                  {(project.goal_amount || project.raised_amount) && (
                    <div style={{ marginTop: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: theme.textSecondary, marginBottom: '2px' }}>
                        <span>{Number(project.raised_amount || 0).toFixed(2)} USDT</span>
                        <span>{t('charity_goal')}: {Number(project.goal_amount || 0).toFixed(2)}</span>
                      </div>
                      <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${getDisplayPercent(project)}%`,
                          backgroundColor: '#F0B90B',
                          borderRadius: '2px',
                        }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
