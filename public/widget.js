(function () {
  if (document.getElementById('chatbeep-widget')) return;

  const container = document.createElement('div');
  container.id = 'chatbeep-widget';
  container.style.position = 'fixed';
  container.style.bottom = '20px';
  container.style.right = '20px';
  container.style.zIndex = '999999';
  container.style.fontFamily = 'sans-serif';

  const button = document.createElement('button');
  button.innerHTML = '💬 Chatbeep';
  button.style.backgroundColor = '#2563eb';
  button.style.color = 'white';
  button.style.border = 'none';
  button.style.padding = '12px 20px';
  button.style.borderRadius = '50px';
  button.style.cursor = 'pointer';
  button.style.fontWeight = 'bold';
  button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';

  const iframe = document.createElement('iframe');
  iframe.src = 'https://chatbeep-private-messaging.onrender.com';
  iframe.style.position = 'absolute';
  iframe.style.bottom = '60px';
  iframe.style.right = '0';
  iframe.style.width = '380px';
  iframe.style.height = '600px';
  iframe.style.maxHeight = '80vh';
  iframe.style.border = '1px solid #3f3f46';
  iframe.style.borderRadius = '16px';
  iframe.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
  iframe.style.backgroundColor = '#000000';
  iframe.style.display = 'none';

  let isOpen = false;
  button.onclick = function () {
    isOpen = !isOpen;
    iframe.style.display = isOpen ? 'block' : 'none';
    button.innerHTML = isOpen ? '✕ Close' : '💬 Chatbeep';
  };

  container.appendChild(iframe);
  container.appendChild(button);
  document.body.appendChild(container);
})();
