import React, { useEffect, useState } from 'react';
import './App.css';

const CLIENT_ID = 27290;

function App() {
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState(null);
  const [userAvatar, setUserAvatar] = useState(null);
  const [rawCode, setRawCode] = useState('');
  const [postUrl, setPostUrl] = useState('');
  const [challenges, setChallenges] = useState(() => {
    const saved = localStorage.getItem('awcChallenges');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [copiedChallengeId, setCopiedChallengeId] = useState(null);
  const [copiedUrlId, setCopiedUrlId] = useState(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const accessToken = new URLSearchParams(hash.substring(1)).get('access_token');
      if (accessToken) {
        setToken(accessToken);
        localStorage.setItem('accessToken', accessToken);
        window.location.hash = '';
      }
    } else {
      const stored = localStorage.getItem('accessToken');
      if (stored) setToken(stored);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query { Viewer { name avatar { medium } } }`
      })
    })
      .then(res => res.json())
      .then(data => {
        setUsername(data.data.Viewer.name);
        setUserAvatar(data.data.Viewer.avatar.medium);
      });
  }, [token]);

  const loginAniList = () => {
    const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${CLIENT_ID}&response_type=token`;
    window.location.href = authUrl;
  };

  const fetchAnime = async (animeId) => {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          title { romaji }
          coverImage { medium }
        }
      }
    `;
    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id: parseInt(animeId) } })
      });
      const json = await response.json();
      return json.data.Media;
    } catch (err) {
      console.warn(`Failed to fetch anime with ID ${animeId}`);
      return null;
    }
  };

  const fetchUserAnimeList = async () => {
    const query = `
      query {
        MediaListCollection(userName: "${username}", type: ANIME) {
          lists {
            entries {
              mediaId
              status
            }
          }
        }
      }
    `;
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });
    const json = await response.json();
    const allEntries = json.data.MediaListCollection.lists.flatMap(list => list.entries);
    const completedIds = new Set(allEntries.filter(e => e.status === 'COMPLETED').map(e => e.mediaId));
    const currentIds = new Set(allEntries.filter(e => e.status === 'CURRENT').map(e => e.mediaId));
    return { completedIds, currentIds };
  };

  const handleAddChallenge = async () => {
    if (!rawCode) return;

    const lines = rawCode.split('\n').map(line => line.trim());
    const headerLine = lines.find(line => line.startsWith('#'));
    const autoTitle = headerLine ? headerLine.replace(/[#_]/g, '').trim() : `Challenge ${Date.now()}`;

    const entries = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const statusMatch = line.match(/\[(✔️|❌|X|O|⭐)\]/);
      if (statusMatch) {
        const statusSymbol = statusMatch[1];
        const statusChallenge = (statusSymbol === '✔️' || statusSymbol === 'X') ? 'complete'
                                : (statusSymbol === '⭐') ? 'ongoing'
                                : 'incomplete';
        const titleMatch = line.match(/__(.+?)__/);
        const title = titleMatch ? titleMatch[1] : 'Unknown';
        const urlLine = lines[i + 1] || '';
        const urlMatch = urlLine.match(/anime\/(\d+)/);
        const animeId = urlMatch ? urlMatch[1] : null;
        const datesLine = lines[i + 2] || '';
        const startMatch = datesLine.match(/Start:\s*([\d-]+)/);
        const endMatch = datesLine.match(/Finish:\s*([\d-]+)/);
        if (animeId) {
          entries.push({
            animeId,
            title,
            statusChallenge,
            startDate: startMatch ? startMatch[1] : null,
            endDate: endMatch ? endMatch[1] : null
          });
        }
      }
    }

    const { completedIds, currentIds } = token ? await fetchUserAnimeList() : { completedIds: new Set(), currentIds: new Set() };
    const enriched = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        const info = await fetchAnime(entry.animeId);
        if (!info) {
          enriched.push(null);
        } else {
          const statusAniList = completedIds.has(parseInt(entry.animeId)) ? 'complete'
                                 : currentIds.has(parseInt(entry.animeId)) ? 'ongoing'
                                 : 'incomplete';
          enriched.push({
            ...entry,
            id: i,
            romajiTitle: info.title.romaji,
            image: info.coverImage.medium,
            statusAniList
          });
        }
      } catch (err) {
        console.warn(`Failed to fetch anime with ID ${entry.animeId}`, err);
        enriched.push(null);
      }
      await new Promise(res => setTimeout(res, 300));
    }

    const filtered = enriched.filter(Boolean);
    const newChallenge = {
      id: Date.now(),
      title: autoTitle,
      postUrl,
      entries: filtered
    };

    const updated = [...challenges, newChallenge];
    setChallenges(updated);
    localStorage.setItem('awcChallenges', JSON.stringify(updated));
    setRawCode('');
    setPostUrl('');
  };

  const deleteChallenge = (id) => {
    const updated = challenges.filter(ch => ch.id !== id);
    setChallenges(updated);
    localStorage.setItem('awcChallenges', JSON.stringify(updated));
    if (selectedChallenge?.id === id) setSelectedChallenge(null);
  };

  const generateChallengeCode = (challenge) => {
    const header = `__${challenge.title}__\n\nChallenge Start Date: YYYY-MM-DD\nChallenge Finish Date: YYYY-MM-DD\nLegend: [✔️] = Completed [❌] = Not Completed [⭐] = Ongoing\n\n<hr>\n`;
    const blocks = challenge.entries.map((entry, i) => {
      const symbol = entry.statusAniList === 'complete' ? '✔️' : (entry.statusChallenge === 'ongoing' ? '⭐' : '❌');
      return `${String(i + 1).padStart(2, '0')}) [${symbol}] __${entry.romajiTitle}__\nhttps://anilist.co/anime/${entry.animeId}/\nStart: ${entry.startDate || 'YYYY-MM-DD'} Finish: ${entry.endDate || 'YYYY-MM-DD'}`;
    });
    return header + blocks.join('\n\n');
  };

  const handleCopyChallengeCode = (challenge) => {
    const text = generateChallengeCode(challenge);
    navigator.clipboard.writeText(text);
    setCopiedChallengeId(challenge.id);
    setTimeout(() => setCopiedChallengeId(null), 2000);
  };

  const handleCopyPostUrl = (challenge) => {
    navigator.clipboard.writeText(challenge.postUrl || '');
    setCopiedUrlId(challenge.id);
    setTimeout(() => setCopiedUrlId(null), 2000);
  };

  const globalAnime = challenges
    .flatMap(ch => ch.entries)
    .reduce((acc, anime) => {
      if (!acc[anime.animeId]) {
        acc[anime.animeId] = { ...anime, count: 1 };
      } else {
        acc[anime.animeId].count += 1;
      }
      return acc;
    }, {});

  const renderChallengeDetail = (challenge) => (
    <div>
      <button className="back-button" onClick={() => setSelectedChallenge(null)}>⬅️ Back</button>
      <h2>{challenge.title}</h2>
      <ul>
        {challenge.entries.map((entry) => (
          <li key={entry.id}>
            <a href={`https://anilist.co/anime/${entry.animeId}`} target="_blank" rel="noreferrer">
              <img src={entry.image} alt={entry.romajiTitle} />
            </a>
            <div>
              <a href={`https://anilist.co/anime/${entry.animeId}`} target="_blank" rel="noreferrer">
                <strong>{entry.romajiTitle}</strong>
              </a><br />
              AniList: {entry.statusAniList === 'complete' ? '✅' : entry.statusAniList === 'ongoing' ? '⭐' : '❌'} | Challenge: {entry.statusChallenge === 'complete' ? '✅' : entry.statusChallenge === 'ongoing' ? '⭐' : '❌'}
              {entry.statusAniList === 'complete' && entry.statusChallenge === 'incomplete' && (
                <div>⚠️ Needs post update</div>
              )}
              <div>
                Start: {entry.startDate || '—'} | Finish: {entry.endDate || '—'}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="App">
      <div className="sidebar">
        <h1 style={{ cursor: 'pointer' }} onClick={() => setSelectedChallenge(null)}>📚 AWC Tracker</h1>
        {!token ? (
          <button onClick={loginAniList}>🔑 Login with AniList</button>
        ) : (
          <a href={`https://anilist.co/user/${username}`} target="_blank" rel="noreferrer" className="profile-display">
            <img className="avatar" src={userAvatar} alt="Avatar" />
            <span>{username}</span>
          </a>
        )}
        <h3>Saved Challenges</h3>
        <ul>
          {challenges.map(ch => (
            <li key={ch.id} onClick={() => setSelectedChallenge(ch)} style={{ cursor: 'pointer' }}>
              <strong>{ch.title}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="main">
        {!selectedChallenge ? (
          <>
            <h2>➕ Add Challenge</h2>
            <textarea
              value={rawCode}
              onChange={(e) => setRawCode(e.target.value)}
              rows={8}
              placeholder="Paste challenge code here"
            />
            <input
              type="text"
              placeholder="Optional: Forum post URL"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
            />
            <button onClick={handleAddChallenge}>➕ Save Challenge</button>

            <h2>📊 Global Tracker</h2>
            <ul>
              {Object.values(globalAnime).map(anime => (
                <li key={anime.animeId}>
                  <a href={`https://anilist.co/anime/${anime.animeId}`} target="_blank" rel="noreferrer">
                    <img src={anime.image} alt={anime.romajiTitle} />
                  </a>
                  <div>
                    <a href={`https://anilist.co/anime/${anime.animeId}`} target="_blank" rel="noreferrer">
                      <strong>{anime.romajiTitle}</strong>
                    </a><br />
                    AniList: {anime.statusAniList === 'complete' ? '✅' : anime.statusAniList === 'ongoing' ? '⭐' : '❌'} | Challenge: {anime.statusChallenge === 'complete' ? '✅' : anime.statusChallenge === 'ongoing' ? '⭐' : '❌'}
                    {anime.statusAniList === 'complete' && anime.statusChallenge === 'incomplete' && (
                      <div>⚠️ Needs post update</div>
                    )}
                    {anime.count > 1 && (
                      <div>🔁 In {anime.count} challenges</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          renderChallengeDetail(selectedChallenge)
        )}
      </div>

      <div className="rightbar">
        <h2>📋 Manage</h2>
        <ul>
          {challenges.map((ch) => {
            const completed = ch.entries.filter((e) => e.statusAniList === 'complete').length;
            const total = ch.entries.length;
            return (
              <li key={ch.id}>
                <div>
                  <strong>{ch.title}</strong><br />
                  ✅ {completed}/{total}
                  <div className="button-row">
                    <button onClick={() => handleCopyPostUrl(ch)}>
                      {copiedUrlId === ch.id ? '✅ Post URL' : '🔗 Copy URL'}
                    </button>
                    <button onClick={() => handleCopyChallengeCode(ch)}>
                      {copiedChallengeId === ch.id ? '✅ Code' : '📋 Copy Code'}
                    </button>
                  </div>
                  {ch.postUrl && (
                    <div className="awc-link">
                      <a href={`https://awc.moe/challenges/editor?url=${encodeURIComponent(ch.postUrl)}`} target="_blank" rel="noreferrer">
                        🌐 AWC Editor
                      </a>
                    </div>
                  )}
                </div>
                <button onClick={() => deleteChallenge(ch.id)}>🗑</button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default App;
