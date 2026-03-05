import React, { useEffect, useState, useRef } from 'react';
import { theme } from '../theme';
import { api } from '../services/api';
import { useLang } from '../context/LanguageContext';

type CharityView = 'list' | 'detail';

interface CharityProject {
  id: string;
  title: string;
  description: string;
  image_url: string;
  status: 'active' | 'completed' | 'cancelled';
  ambassador_telegram?: string;
  is_active?: boolean;
}

interface CharityBanner {
  id: string;
  image_url: string;
  title?: string;
}

const BANNER_ROTATION_INTERVAL = 10000; // 10 seconds

export const Charity: React.FC = () => {
  const { t } = useLang();
  const [projects, setProjects] = useState<CharityProject[]>([]);
  const [banners, setBanners] = useState<CharityBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CharityView>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const selected = projects.find(p => p.id === selectedId) || null;

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    bannerTimer.current = setInterval(() => {
      setBannerIndex(i => (i + 1) % banners.length);
    }, BANNER_ROTATION_INTERVAL);
    return () => {
      if (bannerTimer.current) clearInterval(bannerTimer.current);
    };
  }, [banners.length]);

  const fetchData = async () => {
    try {
      const [projRes, bannerRes] = await Promise.allSettled([
        api.get('/charity/projects'),
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
      <div style={{ paddingBottom: '80px' }}>
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
            <img src={selected.image_url} alt={selected.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

          {selected.description && (
            <p style={{ color: theme.textSecondary, fontSize: '14px', lineHeight: '1.7', marginBottom: '24px' }}>
              {selected.description}
            </p>
          )}
        </div>

        <div style={{ position: 'fixed', bottom: '68px', left: '16px', right: '16px' }}>
          <button
            disabled={!hasAmbassador}
            onClick={() => hasAmbassador && window.open(`https://t.me/${selected.ambassador_telegram}`, '_blank')}
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
    <div style={{ paddingBottom: '80px' }}>
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
                  <img src={banner.image_url} alt={banner.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                  <img src={project.image_url} alt={project.title} style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
