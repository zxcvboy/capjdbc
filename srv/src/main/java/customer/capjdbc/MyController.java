package customer.capjdbc;

import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.Socket;
import java.net.SocketAddress;
import java.net.URL;
import java.net.URLConnection;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import javax.naming.InitialContext;
import javax.sql.DataSource;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.microsoft.sqlserver.jdbc.SQLServerConnection;
import com.microsoft.sqlserver.jdbc.SQLServerDriver;
import com.microsoft.sqlserver.jdbc.StringUtils;
import com.sap.cds.Result;
import com.sap.cds.Row;
import com.sap.cds.Struct;
import com.sap.cds.feature.xsuaa.XsuaaUserInfo;
import com.sap.cds.ql.Select;
import com.sap.cds.ql.Upsert;
import com.sap.cds.ql.cqn.CqnSelect;
import com.sap.cds.ql.cqn.CqnUpsert;
import com.sap.cds.services.ErrorStatuses;
import com.sap.cds.services.ServiceException;
import com.sap.cds.services.persistence.PersistenceService;
import com.sap.cloud.security.xsuaa.token.Token;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import sun.util.calendar.LocalGregorianCalendar.Date;

import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.ResponseBody;
import org.apache.tomcat.jni.Time;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.microsoft.sqlserver.jdbc.SQLServerDriver;

@RestController
// @PreAuthorize("isAuthenticated()")
// @RequestMapping("/test-api")
@RequestMapping(value = "/rest")
public class MyController {
    private static final Logger LOGGER = LoggerFactory.getLogger(MyController.class);

    @Autowired
    JwtDecoder jwtDecoder;
    @Autowired
    PersistenceService db;
    @Autowired
    XsuaaUserInfo xsuaaUserInfo;

    // @RequestMapping(method = RequestMethod.GET, value="/allstudent")
   @PreAuthorize("permitAll()")
    //@GetMapping("/dynamicApp")
    @RequestMapping(value = "/dynamicApp", produces = MediaType.APPLICATION_JSON_VALUE, method = RequestMethod.GET)
    @ResponseBody
    public Map<String, Object> dynamicApp( @AuthenticationPrincipal Token token) {

     Map<String, Object> data = new HashMap<String, Object>();
       DynamicApp value = new DynamicApp();   
        java.util.Date now = new java.util.Date();
        value.setNumber(now.getSeconds());
          data.put("d", value);
        return data;
    }


    @PreAuthorize("permitAll()")
    @GetMapping("/proxytest")
    @ResponseBody
    public String proxytest( @AuthenticationPrincipal Token token) {


         try {
             InetSocketAddress vAddr = InetSocketAddress.createUnresolved("testdb", 1433);            

            ConnectivitySocks5ProxySocket proxySocket = new ConnectivitySocks5ProxySocket(null,null);
            proxySocket.connect(vAddr,3600);
            if( proxySocket.isConnected())
            {
                proxySocket.close();
                return "ok InetAddress:"+proxySocket.getInetAddress()+"("+proxySocket.getInetAddress().getHostAddress()+"):, "
                +"ProxyAddress: "+proxySocket.getProxyAddress().getAddress().getHostAddress()
                +"getRemoteSocketAddress: "+proxySocket.getRemoteSocketAddress().toString()
                +"getLocalSocketAddress: "+proxySocket.getLocalSocketAddress().toString();
            }
          else
          {
              return proxySocket.getInetAddress().getHostName();
          }
          
        }
        catch (Exception e) {

            e.printStackTrace();
            return e.getMessage();
        }

    }
        @PreAuthorize("permitAll()")
        @GetMapping("/jdbctest")
        @ResponseBody
        public String jdbctest( @AuthenticationPrincipal Token token) {
            
            SQLServerConnection con =null;
            Statement stmt = null;
            ResultSet rs =null;
            String rtn="";
           
            
            try{

                    ConnectivitySocks5ProxySocket proxySocket = new ConnectivitySocks5ProxySocket();
                    InetSocketAddress tmp = proxySocket.getProxyAddress();
                     String host = tmp.getAddress().getHostAddress();
                    int port =tmp.getPort();
                    String connectionUrl = "jdbc:sqlserver://" + host + ":" + port + ";databaseName=LIFERAY_TEST";
               
                    Class.forName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
                    Properties props = new Properties();
                    props.setProperty("socketFactoryClass", DummySocketFactory.class.getName());
                    props.setProperty("user", "MEHOLiferaySearch");
                    props.setProperty("password", "1qaz@WSX");                  
                    con = (SQLServerConnection) DriverManager.getConnection(connectionUrl,props);

                   

                    if(con!=null)
                    {
                        int count =-1;
                         String sql = "SELECT COUNT(*) AS total FROM Merry_Device";
                         stmt = con.createStatement();
                        rs = stmt.executeQuery(sql);
                        if( rs.next())
                        {
                            count =rs.getInt("total"); 
                        }
                      
                        rtn = "connect successfully: "+count;
                    }
            }
            catch (Exception e) {

                e.printStackTrace();
                return e.getMessage();
            }
            finally
            {
                
                if(stmt!=null)
                {
                     try{
                          stmt.close();
                     }
                    catch (Exception e) {
                        e.printStackTrace();
                        return e.getMessage();
                    }
                   
                }
                if(con!=null)
                {
                     try{
                          con.close();
                     }
                    catch (Exception e) {
                        e.printStackTrace();
                        return e.getMessage();
                    }
                   
                }
            }
            return rtn;
        }
        @PreAuthorize("permitAll()")
        @GetMapping("/jdbctestIn")
        @ResponseBody
        public String jdbctestIn( @AuthenticationPrincipal Token token) {
            Connection con =null;
            String rtn="";
            String connectionUrl= "jdbc:sqlserver://testdb:1433;databaseName=LIFERAY_TEST";
            try{
                     Class.forName("com.microsoft.sqlserver.jdbc.SQLServerDriver");
                    Properties props = new Properties();
                    
                    props.setProperty("socketFactoryClass", DummySocketFactory.class.getCanonicalName());
                    props.setProperty("user", "MEHOLiferaySearch");
                    props.setProperty("password", "1qaz@WSX");
                   con = DriverManager.getConnection(connectionUrl,props);
                    if(con!=null)
                    {
                        rtn = "connect successfully";
                    }
            }
            catch (Exception e) {

                e.printStackTrace();
                return e.getMessage();
            }
            finally
            {
                if(con!=null)
                {
                     try{
                          con.close();
                     }
                    catch (Exception e) {
                        e.printStackTrace();
                        return e.getMessage();
                    }
                   
                }
            }
            return rtn;
        }
   }
class InvalidSocketFactory {}