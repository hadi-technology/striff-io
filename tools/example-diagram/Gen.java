import com.hadi.clarpse.compiler.ProjectFiles;
import com.hadi.striff.StriffConfig;
import com.hadi.striff.StriffOperation;
import com.hadi.striff.diagram.StriffDiagram;
import java.nio.file.*;
import java.util.List;

public class Gen {
    public static void main(String[] a) throws Exception {
        List<StriffDiagram> ds = new StriffOperation(new ProjectFiles(a[0]), new ProjectFiles(a[1]), new StriffConfig()).result().diagrams();
        int i = 0;
        for (StriffDiagram d : ds) {
            System.out.println("diagram " + i + " size=" + d.size() + " pkgs=" + d.containedPkgs());
            if (d.svg() != null) Files.writeString(Path.of(a[2] + "/acme-418-" + i + ".svg"), d.svg());
            i++;
        }
    }
}
