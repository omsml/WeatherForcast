const config = {
    apiKey: '1234567890', //add your own apikey in here .
    baseUrl: 'https://api.openweathermap.org/data/2.5',
    geoUrl: 'https://api.openweathermap.org/geo/1.0/direct',
    defaultCity: 'Bhubaneswar',
    unit: 'metric'
};

let lastCondition = 'clear';

$(document).ready(() => {
    initApp();
    
    // Theme Synchronizer
    $('#theme-toggle').on('click', () => {
        $('html').toggleClass('dark');
        updateBackground();
    });

    // Global Search Submission
    $('#global-search-form').on('submit', (e) => {
        e.preventDefault();
        const city = $('#city-input').val().trim();
        if (city) globalSearch(city);
    });
});

async function initApp() {
    await fetchWeatherData(config.defaultCity);
    updateDateTime();
    setInterval(updateDateTime, 1000);
}

function updateDateTime() {
    $('#date-time').text(moment().format('dddd, MMMM Do YYYY, h:mm:ss a'));
}

async function fetchWithRetry(url, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('API unreachable');
            return await response.json();
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
    }
}

async function globalSearch(query) {
    $('#refresh-icon').addClass('refreshing');
    try {
        const data = await fetchWithRetry(`${config.geoUrl}?q=${query}&limit=10&appid=${config.apiKey}`);
        
        if (data.length > 1) {
            renderSearchModal(data);
        } else if (data.length === 1) {
            fetchWeatherData(data[0].name, data[0].lat, data[0].lon, data[0].country);
        } else {
            showError("No matching cities found in our global database.");
        }
    } catch (error) {
        showError("Global Search Engine is temporarily offline.");
    } finally {
        $('#refresh-icon').removeClass('refreshing');
    }
}

function renderSearchModal(results) {
    const stack = $('#results-stack');
    stack.empty();
    $('#res-count').text(`${results.length} global locations found`);
    
    results.forEach(loc => {
        const card = $(`
            <div class="glass-card p-10 rounded-[2.5rem] cursor-pointer hover:border-blue-500 transition-all group flex items-center justify-between" 
                 onclick="loadGlobalCity('${loc.name}', ${loc.lat}, ${loc.lon}, '${loc.country}')">
                <div class="flex items-center gap-8">
                    <div class="w-16 h-16 bg-blue-600/10 rounded-[1.5rem] flex items-center justify-center text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                        <i class="fas fa-location-dot text-2xl"></i>
                    </div>
                    <div>
                        <h4 class="text-3xl font-black text-white tracking-tighter">${loc.name}</h4>
                        <p class="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mt-1">${loc.state || ''} ${loc.country}</p>
                    </div>
                </div>
                <div class="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-blue-600 group-hover:border-blue-600 transition-all">
                    <i class="fas fa-chevron-right text-white"></i>
                </div>
            </div>
        `);
        stack.append(card);
    });
    $('#search-overlay').fadeIn(400);
}

window.loadGlobalCity = (name, lat, lon, country) => {
    closeSearch();
    fetchWeatherData(name, lat, lon, country);
};

function closeSearch() { $('#search-overlay').fadeOut(300); }

async function fetchWeatherData(name, lat = null, lon = null, country = null) {
    let curUrl = lat ? `${config.baseUrl}/weather?lat=${lat}&lon=${lon}&units=${config.unit}&appid=${config.apiKey}` 
                     : `${config.baseUrl}/weather?q=${name}&units=${config.unit}&appid=${config.apiKey}`;
    
    let fcUrl = lat ? `${config.baseUrl}/forecast?lat=${lat}&lon=${lon}&units=${config.unit}&appid=${config.apiKey}` 
                    : `${config.baseUrl}/forecast?q=${name}&units=${config.unit}&appid=${config.apiKey}`;

    try {
        const [weather, forecast] = await Promise.all([
            fetchWithRetry(curUrl),
            fetchWithRetry(fcUrl)
        ]);

        if (weather.cod === 200) {
            renderDashboard(weather, name);
            renderForecast(forecast.list);
            
            const aqi = await fetchWithRetry(`${config.baseUrl}/air_pollution?lat=${weather.coord.lat}&lon=${weather.coord.lon}&appid=${config.apiKey}`);
            updateAQIUI(aqi.list[0].main.aqi);
        }
    } catch (err) {
        showError("Weather data sync failed for " + name);
    }
}

function renderDashboard(data, searchName) {
    $('#city-name').text(searchName || data.name);
    $('#loc-country').text(data.sys.country);
    $('#temperature').text(`${Math.round(data.main.temp)}°`);
    $('#feels-like').text(Math.round(data.main.feels_like));
    $('#description').text(data.weather[0].description);
    $('#humidity').text(`${data.main.humidity}%`);
    $('#hum-bar').css('width', `${data.main.humidity}%`);
    $('#wind-speed').text(`${Math.round(data.wind.speed)} ${config.unit === 'metric' ? 'km/h' : 'mph'}`);
    $('#sunrise-time').text(moment.unix(data.sys.sunrise).format('h:mm A'));
    $('#sunset-time').text(moment.unix(data.sys.sunset).format('h:mm A'));

    lastCondition = data.weather[0].main.toLowerCase();
    $('#hero-animated-icon').html(getAnimatedIcon(lastCondition));
    updateBackground();
    $('#weather-info').show();
}

function renderForecast(list) {
    const container = $('#forecast-grid');
    container.empty();
    list.filter((_, i) => i % 8 === 0).slice(0, 5).forEach(day => {
        const icon = getAnimatedIcon(day.weather[0].main.toLowerCase());
        const card = $(`
            <div class="glass-card p-8 rounded-[2.5rem] flex flex-col items-center gap-6 hover:scale-105 transition-all duration-500 group">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${moment.unix(day.dt).format('ddd')}</p>
                <div class="scale-90 group-hover:scale-110 transition-transform duration-500">${icon}</div>
                <div class="text-center">
                    <p class="text-2xl font-black">${Math.round(day.main.temp)}°</p>
                    <p class="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1">${day.weather[0].main}</p>
                </div>
            </div>
        `);
        container.append(card);
    });
}

function updateAQIUI(aqi) {
    const levels = { 1: 'Healthy', 2: 'Moderate', 3: 'Unhealthy SG', 4: 'Dangerous', 5: 'Hazardous' };
    const colors = { 1: 'emerald', 2: 'yellow', 3: 'orange', 4: 'red', 5: 'purple' };
    const c = colors[aqi];
    $('#aqi-val').text(`${levels[aqi]} (${aqi * 42})`);
}

function updateBackground() {
    const isDark = $('html').hasClass('dark');
    const gradients = {
        clear: isDark ? 'linear-gradient(135deg, #0b131e 0%, #1e3a8a 100%)' : 'linear-gradient(135deg, #FEF3C7 0%, #93C5FD 100%)',
        clouds: isDark ? 'linear-gradient(135deg, #0b131e 0%, #334155 100%)' : 'linear-gradient(135deg, #F1F5F9 0%, #CBD5E1 100%)',
        rain: isDark ? 'linear-gradient(135deg, #0b131e 0%, #0f172a 100%)' : 'linear-gradient(135deg, #DBEAFE 0%, #94A3B8 100%)',
        default: isDark ? '#0b131e' : '#f8fafc'
    };
    $('body').css('background', gradients[lastCondition] || gradients.default);
}

function setGlobalUnit(u) {
    config.unit = u;
    $('[id^="u-"]').removeClass('temp-unit-active').addClass('text-slate-500');
    $(`#u-${u === 'metric' ? 'metric' : 'imperial'}`).addClass('temp-unit-active').removeClass('text-slate-500');
    fetchWeatherData($('#city-name').text());
}

function getAnimatedIcon(cond) {
    const size = "64";
    if (cond.includes('clear')) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 56 56">
                <g class="sun-rays"><circle cx="28" cy="28" r="14" stroke="#FCD34D" stroke-width="2.5" stroke-dasharray="6 4"/></g>
                <circle class="sun-core" cx="28" cy="28" r="10" fill="#FCD34D"/>
            </svg>`;
    } else if (cond.includes('cloud')) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 56 56" class="cloud-float">
                <ellipse cx="28" cy="26" rx="18" ry="11" fill="#CBD5E1"/>
                <ellipse cx="20" cy="29" rx="12" ry="10" fill="#E2E8F0"/>
            </svg>`;
    } else if (cond.includes('rain')) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 56 56">
                <g class="cloud-float"><ellipse cx="28" cy="24" rx="16" ry="10" fill="#94A3B8"/></g>
                <line x1="22" y1="36" x2="20" y2="44" stroke="#3B82F6" stroke-width="2.5" class="rain-drop-1"/>
                <line x1="30" y1="36" x2="28" y2="44" stroke="#3B82F6" stroke-width="2.5" class="rain-drop-2"/>
            </svg>`;
    }
    return `<i class="fas fa-cloud-sun text-4xl text-slate-400"></i>`;
}

function showError(msg) { console.error(msg); }

function renderForecast(list) {
    const container = $('#forecast-grid');
    container.empty();
    
    // Filters for 5 days of data (one entry per 24 hours)
    list.filter((_, i) => i % 8 === 0).slice(0, 5).forEach(day => {
        const icon = getAnimatedIcon(day.weather[0].main.toLowerCase());
        
        // Formatting the Day (Mon) and the Date (28/02)
        const dayName = moment.unix(day.dt).format('ddd');
        const dateMonth = moment.unix(day.dt).format('DD/MM');

        const card = $(`
            <div class="glass-card p-8 rounded-[2.5rem] flex flex-col items-center gap-4 hover:scale-105 transition-all duration-500 group">
                <div class="text-center">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">${dayName}</p>
                    <p class="text-[9px] font-bold text-blue-500/60 mt-0.5">${dateMonth}</p>
                </div>

                <div class="scale-90 group-hover:scale-110 transition-transform duration-500 py-2">
                    ${icon}
                </div>

                <div class="text-center">
                    <p class="text-2xl font-black">${Math.round(day.main.temp)}°</p>
                    <p class="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1">${day.weather[0].main}</p>
                </div>
            </div>
        `);
        container.append(card);
    });

}
