
export const IMG = {
    milesmorales: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836691/milesmorales_nlb2cl.jpg',
    avengers35: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836687/avengers_35_u83ull.jpg',
    atomproject: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836687/atomproject_pjdxte.avif',
    alienvscaptainamerica: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836686/alienvscaptainamerica_yetv5p.jpg',
    doraemon: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836686/Doraemon_volume_1_cover_p1dcdy.jpg',
    batgirl: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836686/batgirl_ksvh7l.avif',
    allstarsuperman: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836684/all_starsuperman_ktmseb.jpg',
    hunterxhunter: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836686/hunterxhunter_d1t8kv.png',
    haikyu: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836822/haikyu_rdg0ju.png',
    supermanalledition2: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836869/supermanalledition2_ndfty8.avif',
    moonknight: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836911/moonknight_ukzmis.jpg',
    supergirl: 'https://placehold.co/300x450/1a1a1a/E63946?text=Supergirl',
    weareyesterday: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836869/weareyesterday_gpohda.avif',
    onepiece: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836821/onepiece1_i0b7o8.jpg',
    berserk: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836818/berserk_pmilgr.webp',
    akira: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836822/akira_ueakun.png',
    blueperiod: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836820/blueperiod_j2rfun.png',
    pokemonvol3: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836823/pokemonvol3_onxubd.png',
    toy1: 'https://placehold.co/300x450/1a1a1a/E63946?text=Iron+Man',
    toy2: 'https://placehold.co/300x450/1a1a1a/E63946?text=Naruto',
    toy3: 'https://placehold.co/300x450/1a1a1a/E63946?text=Batman',
    toy4: 'https://placehold.co/300x450/1a1a1a/E63946?text=Spider-Man',
    toy5: 'https://placehold.co/300x450/1a1a1a/E63946?text=Goku',
    toy6: 'https://placehold.co/300x450/1a1a1a/E63946?text=Wonder+Woman',
    toy7: 'https://placehold.co/300x450/1a1a1a/E63946?text=MHA+Plush',
    toy8: 'https://placehold.co/300x450/1a1a1a/E63946?text=Loki+Tee',
    toy9: 'https://placehold.co/300x450/1a1a1a/E63946?text=Deadpool+Keychain',
    heroHome: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836684/hero_image_lzmghm.avif',
    heroAmerican: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836871/hero_section_ocsb0x.jpg',
    heroManga: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771836820/hero_imageman_qssfo0.webp',
    heroToys: 'https://res.cloudinary.com/deutxfkar/image/upload/v1771837046/hero_imaget_vf6rj7.jpg',
};


export const demoHome = [
    ...Array(3).fill([
        { name: 'Doraemon Vol. 1', category: 'Manga', price: 14.99, image: IMG.doraemon, badge: 'HOT' },
        { name: 'Miles Morales: Spider-Man', category: 'Marvel', price: 9.99, image: IMG.milesmorales },
        { name: 'Hunter x Hunter Vol. 1', category: 'Manga', price: 12.50, image: IMG.hunterxhunter },
        { name: 'All-Star Superman', category: 'DC', price: 19.99, image: IMG.allstarsuperman },
        { name: 'Alien vs Captain America', category: 'Marvel', price: 89.99, image: IMG.alienvscaptainamerica, badge: 'PREMIUM' },
        { name: 'Batgirl Vol. 1', category: 'DC', price: 16.99, image: IMG.batgirl },
        { name: 'Haikyu!! Vol. 1', category: 'Shōnen', price: 14.00, image: IMG.haikyu },
        { name: 'Avengers #35', category: 'Marvel', price: 24.99, image: IMG.avengers35 },
        { name: 'The Atom Project', category: 'Indie', price: 22.00, image: IMG.atomproject },
    ]).flat()
].map((item, index) => ({ ...item, _id: `home_${index}` }));

export const demoAmerican = [
    ...Array(3).fill([
        { name: 'All-Star Superman', category: 'DC', price: 19.99, image: IMG.allstarsuperman },
        { name: 'Miles Morales: Spider-Man', category: 'Marvel', price: 9.99, image: IMG.milesmorales },
        { name: 'Batgirl Vol. 1', category: 'DC', price: 16.99, image: IMG.batgirl },
        { name: 'Alien vs Captain America', category: 'Marvel', price: 89.99, image: IMG.alienvscaptainamerica, badge: 'PREMIUM' },
        { name: 'Moon Knight: Black, White & Blood', category: 'Marvel', price: 22.00, image: IMG.moonknight },
        { name: 'Avengers #35', category: 'Marvel', price: 24.99, image: IMG.avengers35 },
        { name: 'Supergirl: Woman of Tomorrow', category: 'DC', price: 18.00, image: IMG.supergirl },
        { name: 'We Are Yesterday', category: 'DC', price: 15.99, image: IMG.weareyesterday },
        { name: 'The Atom Project', category: 'Indie', price: 22.00, image: IMG.atomproject },
    ]).flat()
].map((item, index) => ({ ...item, _id: `american_${index}` }));

export const demoManga = [
    ...Array(3).fill([
        { name: 'One Piece Vol. 1', category: 'Shōnen', price: 9.99, image: IMG.onepiece, badge: 'HOT' },
        { name: 'Berserk Vol. 1', category: 'Seinen', price: 14.99, image: IMG.berserk },
        { name: 'Haikyu!! Vol. 1', category: 'Shōnen', price: 14.00, image: IMG.haikyu },
        { name: 'Akira Vol. 1', category: 'Seinen', price: 29.99, image: IMG.akira },
        { name: 'Blue Period Vol. 1', category: 'Seinen', price: 12.99, image: IMG.blueperiod },
        { name: 'Doraemon Vol. 1', category: 'Kodomo', price: 9.99, image: IMG.doraemon },
        { name: 'Hunter x Hunter Vol. 1', category: 'Shōnen', price: 12.50, image: IMG.hunterxhunter },
        { name: 'Pokémon Adventures Vol. 3', category: 'Kodomo', price: 11.99, image: IMG.pokemonvol3 },
    ]).flat()
].map((item, index) => ({ ...item, _id: `manga_${index}` }));

export const demoToys = [
    ...Array(3).fill([
        { name: 'Iron Man MK50 Figure', category: 'Figures', price: 49.99, image: IMG.toy1 },
        { name: 'Naruto Action Figure', category: 'Figures', price: 34.99, image: IMG.toy2 },
        { name: 'Batman Deluxe Figure', category: 'Figures', price: 44.99, image: IMG.toy3 },
        { name: 'Spider-Man Premium Figure', category: 'Figures', price: 39.99, image: IMG.toy4, badge: 'HOT' },
        { name: 'Goku Ultra Instinct', category: 'Figures', price: 59.99, image: IMG.toy5 },
        { name: 'Wonder Woman Figure', category: 'Figures', price: 42.99, image: IMG.toy6 },
        { name: 'MHA Deku Plush', category: 'Plush', price: 19.99, image: IMG.toy7 },
        { name: 'Loki Graphic Tee', category: 'Apparel', price: 24.99, image: IMG.toy8 },
        { name: 'Deadpool Keychain', category: 'Keychain', price: 9.99, image: IMG.toy9 },
    ]).flat()
].map((item, index) => ({ ...item, _id: `toy_${index}` }));

export const demoUser = {
    _id: '507f1f77bcf86cd799439011',
    firstName: 'John', lastName: 'Doe',
    email: 'john@example.com', username: 'johndoe',
    phone: '+91 9876543210', gender: 'male',
    isPremium: false, profileImage: null,
    createdAt: new Date(),
};
