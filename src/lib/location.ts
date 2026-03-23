import type { LocationDetails } from '../types';

export async function getCurrentCoordinates() {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by this browser');
  }

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude
  };
}

export async function getLocationDetails(latitude: number, longitude: number): Promise<LocationDetails> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
  );

  if (!response.ok) {
    throw new Error('Unable to detect location name');
  }

  const data = await response.json();
  const address = data.address || {};
  const city = address.city || address.town || address.village || address.county || 'Unknown city';
  const state = address.state || address.region || 'Unknown state';
  const country = address.country || 'Unknown country';

  return {
    city,
    state,
    country,
    displayName: [city, state, country].filter(Boolean).join(', '),
    countryCode: String(address.country_code || '').toUpperCase() || undefined,
  };
}

export async function reverseGeocode(latitude: number, longitude: number) {
  const details = await getLocationDetails(latitude, longitude);
  return details.displayName;
}

export async function fetchPublicHolidays(countryCode: string, year: number) {
  const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
  if (!response.ok) {
    throw new Error('Unable to fetch public holidays');
  }

  return response.json() as Promise<Array<{ date: string; localName: string; name: string }>>;
}
