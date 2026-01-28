import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './App.css';

// --- POMOCNICZE FUNKCJE MATEMATYCZNE ---

// Obliczanie odległości euklidesowej
const calculateDistance = (p1, p2) => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

// Obliczanie całkowitej długości ścieżki
const calculateTotalDistance = (path, nodes) => {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = nodes.find(n => n.id === path[i]);
    const p2 = nodes.find(n => n.id === path[i + 1]);
    if (p1 && p2) total += calculateDistance(p1, p2);
  }
  // Dodanie powrotu do punktu startowego (TSP to cykl)
  const last = nodes.find(n => n.id === path[path.length - 1]);
  const first = nodes.find(n => n.id === path[0]);
  if (last && first) total += calculateDistance(last, first);
  
  return total;
};

// Algorytm tasowania Fisher-Yates (do losowania permutacji)
const shuffleArray = (array) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

// --- KOMPONENTY UI ---

// 1. Wczytywanie pliku
const FileUploader = ({ onDataLoaded }) => {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n');
      const nodes = [];
      let readingCoord = false;

      // Prosty parser formatu TSPLIB (np. berlin52)
      lines.forEach(line => {
        const cleanLine = line.trim();
        if (cleanLine === 'NODE_COORD_SECTION') {
          readingCoord = true;
          return;
        }
        if (cleanLine === 'EOF') readingCoord = false;

        if (readingCoord) {
          const parts = cleanLine.split(/\s+/);
          if (parts.length >= 3) {
            nodes.push({
              id: parseInt(parts[0]),
              x: parseFloat(parts[1]),
              y: parseFloat(parts[2])
            });
          }
        }
      });
      onDataLoaded(nodes);
    };
    reader.readAsText(file);
  };

  return (
    <div className="component-box">
      <h3>Wczytaj dane (TSPLIB)</h3>
      <input type="file" onChange={handleFileChange} />
    </div>
  );
};

// 2. i 6. Wizualizacja Problemu
const MapVisualizer = ({ nodes, path, showPath }) => {
  if (nodes.length === 0) return null;

  // Obliczanie skali dla SVG
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const padding = 50;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  return (
    <div className="component-box">
      <div className="header">Wizualizacja problemu</div>
      <svg viewBox={`${minX - padding} ${minY - padding} ${width} ${height}`} style={{ border: '1px solid #ccc', width: '100%', maxHeight: '400px' }}>
        {/* Rysowanie ścieżki */}
        {showPath && path.length > 0 && (
          <polyline
            points={[...path, path[0]].map(id => {
              const node = nodes.find(n => n.id === id);
              return node ? `${node.x},${node.y}` : '';
            }).join(' ')}
            fill="none"
            stroke="blue"
            strokeWidth="2"
          />
        )}
        
        {/* Rysowanie punktów */}
        {nodes.map(node => (
          <circle key={node.id} cx={node.x} cy={node.y} r={width / 150} fill="red" />
        ))}
      </svg>
    </div>
  );
};

// 3. Wyświetlanie rozwiązania
const SolutionDisplay = ({ path, distance }) => {
  return (
    <div className="component-box">
      <div className="header">Rozwiązanie</div>
      <div className="path-text">
        {path.length > 0 ? path.join(' -> ') : 'Brak danych'}
      </div>
      <p><strong>Długość trasy:</strong> {distance.toFixed(2)}</p>
    </div>
  );
};

// 5. Wykres liniowy
const OptimizationChart = ({ history }) => {
  return (
    <div className="component-box">
      <h3>Wykres postępu</h3>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="iteration" label={{ value: 'Iteracje', position: 'insideBottomRight', offset: -5 }} />
            <YAxis label={{ value: 'Dystans', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Line type="monotone" dataKey="distance" stroke="#8884d8" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// --- GŁÓWNY KOMPONENT APP ---

function App() {
  const [nodes, setNodes] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);
  const [bestDistance, setBestDistance] = useState(0);
  
  const [isRunning, setIsRunning] = useState(false);
  const [iteration, setIteration] = useState(0);
  const [history, setHistory] = useState([]);
  const [showSolutionOnMap, setShowSolutionOnMap] = useState(false);
  
  const intervalRef = useRef(null);

  // Inicjalizacja po wczytaniu danych
  const handleDataLoaded = (loadedNodes) => {
    setNodes(loadedNodes);
    const initialPath = loadedNodes.map(n => n.id);
    // Wstępne losowanie (zgodnie z pkt 3)
    const shuffledPath = shuffleArray(initialPath);
    const dist = calculateTotalDistance(shuffledPath, loadedNodes);
    
    setCurrentPath(shuffledPath);
    setBestDistance(dist);
    setIteration(0);
    setHistory([{ iteration: 0, distance: dist }]);
    setShowSolutionOnMap(false);
  };

  // 4. Logika Monte Carlo (usługa w tle)
  const toggleSimulation = () => {
    if (isRunning) {
      // Zatrzymanie
      clearInterval(intervalRef.current);
      setIsRunning(false);
    } else {
      // Start
      setIsRunning(true);
      intervalRef.current = setInterval(() => {
        setIteration(prevIter => {
          const currentIter = prevIter + 1;
          
          // Losowanie nowego rozwiązania (Monte Carlo)
          const newPath = shuffleArray(currentPath); // Bierzemy obecną jako bazę permutacji (w MC to czysty los)
          const newDist = calculateTotalDistance(newPath, nodes);

          setBestDistance(prevDist => {
            if (newDist < prevDist) {
              setCurrentPath(newPath);
              setHistory(prevHist => [...prevHist, { iteration: currentIter, distance: newDist }]);
              return newDist;
            } else {
              setHistory(prevHist => [...prevHist, { iteration: currentIter, distance: prevDist }]);
              return prevDist;
            }
          });

          return currentIter;
        });
      }, 5000); // Co 5 sekund zgodnie z wymaganiem
    }
  };

  // Czyszczenie interwału przy odmontowaniu
  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  return (
    <div className="App">
      <h1>Problem Komiwojażera (TSP)</h1>
      
      {/* 1. Wczytywanie */}
      <FileUploader onDataLoaded={handleDataLoaded} />

      {nodes.length > 0 && (
        <>
          <div className="grid-container">
            {/* 2. Wizualizacja + 6. Przycisk Pokaż */}
            <div className="visualizer-wrapper">
              <MapVisualizer 
                nodes={nodes} 
                path={currentPath} 
                showPath={showSolutionOnMap} 
              />
              <button onClick={() => setShowSolutionOnMap(!showSolutionOnMap)}>
                {showSolutionOnMap ? "Ukryj połączenia" : "Pokaż rozwiązanie"}
              </button>
            </div>

            {/* 3. Wyświetlanie danych liczbowych */}
            <SolutionDisplay path={currentPath} distance={bestDistance} />
          </div>

          {/* 4. Panel Sterowania */}
          <div className="control-panel component-box">
            <button 
              onClick={toggleSimulation} 
              className={isRunning ? 'btn-stop' : 'btn-start'}
            >
              {isRunning ? "Przerwa" : "Szukaj rozwiązania"}
            </button>
            <span className="stats">Iteracje: {iteration}</span>
          </div>

          {/* 5. Wykres */}
          <OptimizationChart history={history} />
        </>
      )}
    </div>
  );
}

export default App;