package customer.capjdbc;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.UnknownHostException;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;

import javax.net.SocketFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.jwt.JwtDecoder;

 public  class DummySocketFactory extends SocketFactory {


     private static final Logger LOGGER = LoggerFactory.getLogger(DummySocketFactory.class);
        private final String arg;
         private static List<String> dummyLog = new ArrayList<>();
         private String myhostName ="testdb";
         private int myport =1433;
        public DummySocketFactory(String arg) {
            this.arg = arg;
             LOGGER.error("DummySocketFactory constructure 1");
        }

        public DummySocketFactory() {
            this.arg = null;
            LOGGER.error("DummySocketFactory constructure 2");
        }

        private void logUsage() {
            dummyLog.add(arg);
        }

        @Override
        public Socket createSocket() throws IOException {
            logUsage();
            LOGGER.error("DummySocketFactory createSocket 1");
            InetSocketAddress vAddr = InetSocketAddress.createUnresolved(myhostName, myport);
             ConnectivitySocks5ProxySocket proxySocket = new ConnectivitySocks5ProxySocket();
            proxySocket.connect(vAddr,3600);
            return proxySocket;
            
        }

        @Override
        public Socket createSocket(String host, int port) throws IOException {
            logUsage();
            LOGGER.error("DummySocketFactory createSocket 2");
             //InetSocketAddress vAddr = InetSocketAddress.createUnresolved(host, port);
             InetSocketAddress vAddr = InetSocketAddress.createUnresolved(myhostName, myport);
            ConnectivitySocks5ProxySocket proxySocket = new ConnectivitySocks5ProxySocket();
            proxySocket.connect(vAddr,3600);
           return proxySocket;
         
        }

        @Override
        public Socket createSocket(String host, int port, InetAddress localHost,
                int localPort) throws IOException, UnknownHostException {
            logUsage();
            LOGGER.error("DummySocketFactory createSocket 3");
            return createSocket(host,port);
            //return new Socket(host, port, localHost, localPort);
        }

        @Override
        public Socket createSocket(InetAddress host, int port) throws IOException {
            logUsage();
            LOGGER.error("DummySocketFactory createSocket 4");
            //return new Socket(host, port);
             //InetSocketAddress vAddr = InetSocketAddress.createUnresolved(host.getHostName(), port);
             InetSocketAddress vAddr = InetSocketAddress.createUnresolved(myhostName, myport);
             ConnectivitySocks5ProxySocket proxySocket = new ConnectivitySocks5ProxySocket();
            proxySocket.connect(vAddr,3600);
           return proxySocket;
        }

        @Override
        public Socket createSocket(InetAddress address, int port, InetAddress localAddress,
                int localPort) throws IOException {
                    LOGGER.error("DummySocketFactory createSocket 5");
            logUsage();
            return createSocket(address,port);
            //return new Socket(address, port, localAddress, localPort);
        }
        
    }
