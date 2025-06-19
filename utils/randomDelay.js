function randomDelay(min = 3000, max = 7000) {
  return new Promise(resolve => {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    setTimeout(resolve, delay);
  });
}

module.exports = { randomDelay }; 